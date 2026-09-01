import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
import { feeStatementHtml, feeStatementPdf } from '../services/document.service.js';
import { COURSE_STATUS } from './student.routes.js';

/**
 * Courses, enrolments and the discount that sits on them.
 *
 * Two things live here because they are two halves of one subject:
 *
 *   - `/api/courses` is the catalogue — what IIGL teaches, how long it runs,
 *     what it costs;
 *   - `/api/courses/enrolments` is one student on one course in one batch,
 *     which is where the money is: the fee copied from the catalogue, the
 *     discount, what that leaves, and what has been paid.
 *
 * **The discount is not a stage and not a table.** It is columns on the
 * enrolment beside the fee it reduces, so the two cannot drift apart and no
 * join is needed to answer what a student owes. `PATCH .../discount` is the
 * only way to set it, and it recomputes `final_fee` itself rather than
 * accepting one.
 */
export const courseRoutes = Router();
courseRoutes.use(requireAdmin);

const DISCOUNT_TYPE = ['percent', 'fixed'] as const;

const text = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim());

const requireText = (v: unknown, field: string): string => {
  const s = text(v);
  if (!s) throw badRequest(`${field} is required.`);
  return s;
};

const money = (v: unknown, field: string): number => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) throw badRequest(`${field} must be a number of zero or more.`);
  return n;
};

const date = (v: unknown): Date | null => {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest(`${s} is not a date.`);
  return d;
};

function oneOf<T extends readonly string[]>(allowed: T, v: unknown, fallback?: T[number]): T[number] {
  if (v == null || v === '') {
    if (fallback) return fallback;
    throw badRequest(`Expected one of: ${allowed.join(', ')}.`);
  }
  const s = String(v);
  if (!allowed.includes(s)) throw badRequest(`Unknown value. Expected one of: ${allowed.join(', ')}.`);
  return s;
}

/**
 * What a discount takes off a fee.
 *
 * Rounded to whole rupees and capped at the fee: a 110% discount or a fixed
 * amount larger than the course is a typo, and letting it through would put a
 * negative figure on an invoice.
 */
export function discountOf(fee: number, type: string | null, value: number): number {
  if (!type || value <= 0) return 0;
  const raw = type === 'percent' ? (fee * value) / 100 : value;
  return Math.min(fee, Math.round(raw));
}

// ============================================================== the catalogue

courseRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req);
    const term = String(req.query.q ?? '').trim();
    const active = req.query.active;

    const build = (base: any) => {
      let q = base;
      if (active === '1') q = q.where('is_active', '=', 1);
      if (active === '0') q = q.where('is_active', '=', 0);
      if (term) {
        const like = `%${term}%`;
        q = q.where((eb: any) => eb.or([eb('name', 'like', like), eb('code', 'like', like)]));
      }
      return q;
    };

    const [rows, count] = await Promise.all([
      build(db.selectFrom('courses').selectAll())
        .orderBy('name', 'asc')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      build(db.selectFrom('courses').select(db.fn.countAll().as('n'))).executeTakeFirstOrThrow(),
    ]);

    res.json(paged(rows, Number(count.n), p));
  }),
);

courseRoutes.post(
  '/',
  wrap(async (req, res) => {
    const b = req.body ?? {};
    const name = requireText(b.name, 'Course name');

    const clash = await db
      .selectFrom('courses')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst();
    if (clash) throw conflict(`A course called ${name} already exists.`);

    const result = await db
      .insertInto('courses')
      .values({
        name,
        code: text(b.code),
        duration: text(b.duration),
        fee: String(money(b.fee, 'Fee')),
        description: text(b.description),
        is_active: b.is_active === false ? 0 : 1,
        added_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

courseRoutes.patch(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const courseId = Number(req.params.id);
    const existing = await db
      .selectFrom('courses')
      .select('id')
      .where('id', '=', courseId)
      .executeTakeFirst();
    if (!existing) throw notFound('Course not found.');

    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (b.name !== undefined) patch.name = requireText(b.name, 'Course name');
    if (b.code !== undefined) patch.code = text(b.code);
    if (b.duration !== undefined) patch.duration = text(b.duration);
    if (b.fee !== undefined) patch.fee = String(money(b.fee, 'Fee'));
    if (b.description !== undefined) patch.description = text(b.description);
    if (b.is_active !== undefined) patch.is_active = b.is_active ? 1 : 0;

    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update.');
    patch.updated_at = new Date();

    // Changing the catalogue fee does not touch anybody's enrolment: the fee on
    // an enrolment is what that student was billed, and last year's students
    // are not re-invoiced because this year's price moved.
    await db.updateTable('courses').set(patch).where('id', '=', courseId).execute();
    res.json({ ok: true });
  }),
);

courseRoutes.delete(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const courseId = Number(req.params.id);

    const enrolled = await db
      .selectFrom('student_courses')
      .select('id')
      .where('course_id', '=', courseId)
      .executeTakeFirst();
    if (enrolled) {
      throw conflict('Students are enrolled on this course. Retire it instead of deleting it.');
    }

    const result = await db.deleteFrom('courses').where('id', '=', courseId).executeTakeFirst();
    if (!Number(result.numDeletedRows)) throw notFound('Course not found.');
    res.json({ ok: true });
  }),
);

// ============================================================== the enrolments

/** One enrolment, joined to the names a screen has to show. */
function enrolmentQuery() {
  return db
    .selectFrom('student_courses as sc')
    .leftJoin('students as s', 's.id', 'sc.student_id')
    .leftJoin('courses as c', 'c.id', 'sc.course_id')
    // Whether a certificate has been issued against this enrolment, and where
    // the file is. The enrolments list offers it once the course is finished
    // and the fee is settled, and it cannot offer what it cannot see.
    .leftJoin('student_certificates as cert', 'cert.student_course_id', 'sc.id')
    .select([
      'sc.id',
      'sc.student_id',
      'sc.course_id',
      'sc.batch',
      'sc.start_date',
      'sc.end_date',
      'sc.fee',
      'sc.discount_type',
      'sc.discount_value',
      'sc.discount_amount',
      'sc.discount_reason',
      'sc.discount_applied_on',
      'sc.discount_approved_by',
      'sc.final_fee',
      'sc.fee_paid',
      'sc.status',
      'sc.completed_on',
      'sc.result',
      'sc.remark',
      's.name as student_name',
      's.registration_no',
      's.mobile',
      'c.name as course_name',
      'c.duration',
      'cert.id as certificate_id',
      'cert.certificate_no',
      'cert.file as certificate_file',
      'cert.issued_on as certificate_issued_on',
    ]);
}

courseRoutes.get(
  '/enrolments',
  wrap(async (req, res) => {
    const p = readPage(req);
    const status = req.query.status ? oneOf(COURSE_STATUS, req.query.status) : null;
    const term = String(req.query.q ?? '').trim();
    const discounted = req.query.discounted === '1';
    const studentId = req.query.student_id ? Number(req.query.student_id) : null;

    const build = (base: any) => {
      let q = base;
      if (status) q = q.where('sc.status', '=', status);
      if (studentId) q = q.where('sc.student_id', '=', studentId);
      if (discounted) q = q.where('sc.discount_amount', '>', '0');
      if (term) {
        const like = `%${term}%`;
        q = q.where((eb: any) =>
          eb.or([
            eb('s.name', 'like', like),
            eb('s.registration_no', 'like', like),
            eb('s.mobile', 'like', like),
            eb('c.name', 'like', like),
            eb('sc.batch', 'like', like),
          ]),
        );
      }
      return q;
    };

    const [rows, count] = await Promise.all([
      build(enrolmentQuery()).orderBy('sc.id', 'desc').limit(p.limit).offset(p.offset).execute(),
      build(
        db
          .selectFrom('student_courses as sc')
          .leftJoin('students as s', 's.id', 'sc.student_id')
          .leftJoin('courses as c', 'c.id', 'sc.course_id')
          .select(db.fn.countAll().as('n')),
      ).executeTakeFirstOrThrow(),
    ]);

    res.json(paged(rows, Number(count.n), p));
  }),
);

courseRoutes.post(
  '/enrolments',
  wrap(async (req, res) => {
    const b = req.body ?? {};
    const studentId = Number(b.student_id);
    const courseId = Number(b.course_id);
    if (!studentId || !courseId) throw badRequest('A student and a course are required.');

    const [student, course] = await Promise.all([
      db.selectFrom('students').select('id').where('id', '=', studentId).executeTakeFirst(),
      db.selectFrom('courses').selectAll().where('id', '=', courseId).executeTakeFirst(),
    ]);
    if (!student) throw notFound('Student not found.');
    if (!course) throw notFound('Course not found.');

    const already = await db
      .selectFrom('student_courses')
      .select('id')
      .where('student_id', '=', studentId)
      .where('course_id', '=', courseId)
      .where('status', '!=', 'completed')
      .executeTakeFirst();
    if (already) throw conflict('That student is already on this course.');

    // The fee is copied from the catalogue rather than read through it, so a
    // price change next year cannot restate what this student was billed.
    const fee = b.fee !== undefined ? money(b.fee, 'Fee') : Number(course.fee);

    const result = await db
      .insertInto('student_courses')
      .values({
        student_id: studentId,
        course_id: courseId,
        batch: text(b.batch),
        start_date: date(b.start_date),
        end_date: date(b.end_date),
        fee: String(fee),
        final_fee: String(fee),
        fee_paid: String(money(b.fee_paid, 'Fee paid')),
        status: oneOf(COURSE_STATUS, b.status, 'upcoming'),
        remark: text(b.remark),
        added_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();

    // Registering somebody and then enrolling them makes them an active
    // student; leaving the registration "pending" behind an enrolment would be
    // a status nobody maintains by hand.
    await db
      .updateTable('students')
      .set({ status: 'active', updated_at: new Date() })
      .where('id', '=', studentId)
      .where('status', '!=', 'active')
      .execute();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

courseRoutes.patch(
  '/enrolments/:id',
  numericId,
  wrap(async (req, res) => {
    const enrolmentId = Number(req.params.id);
    const existing = await db
      .selectFrom('student_courses')
      .selectAll()
      .where('id', '=', enrolmentId)
      .executeTakeFirst();
    if (!existing) throw notFound('Enrolment not found.');

    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (b.batch !== undefined) patch.batch = text(b.batch);
    if (b.start_date !== undefined) patch.start_date = date(b.start_date);
    if (b.end_date !== undefined) patch.end_date = date(b.end_date);
    if (b.remark !== undefined) patch.remark = text(b.remark);
    if (b.result !== undefined) patch.result = text(b.result);
    if (b.fee_paid !== undefined) patch.fee_paid = String(money(b.fee_paid, 'Fee paid'));

    if (b.fee !== undefined) {
      const fee = money(b.fee, 'Fee');
      patch.fee = String(fee);
      // The discount is a rule, not a number: change the fee and what it takes
      // off changes with it.
      const cut = discountOf(fee, existing.discount_type, Number(existing.discount_value));
      patch.discount_amount = String(cut);
      patch.final_fee = String(fee - cut);
    }

    if (b.status !== undefined) {
      const status = oneOf(COURSE_STATUS, b.status);
      patch.status = status;
      patch.completed_on =
        status === 'completed' ? (date(b.completed_on) ?? new Date()) : null;
    }

    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update.');
    patch.updated_at = new Date();

    await db.updateTable('student_courses').set(patch).where('id', '=', enrolmentId).execute();
    res.json({ ok: true });
  }),
);

/**
 * The discount, applied to the enrolment that holds the fee.
 *
 * `final_fee` is computed here and never accepted from the request: a client
 * that sends its own total is a client that can send one the fee and the
 * discount do not add up to.
 */
courseRoutes.patch(
  '/enrolments/:id/discount',
  numericId,
  wrap(async (req, res) => {
    const enrolmentId = Number(req.params.id);
    const existing = await db
      .selectFrom('student_courses')
      .selectAll()
      .where('id', '=', enrolmentId)
      .executeTakeFirst();
    if (!existing) throw notFound('Enrolment not found.');

    const b = req.body ?? {};
    const fee = Number(existing.fee);

    /*
     * A discount is settled before the money starts moving.
     *
     * Once a payment has been taken against this enrolment the fee is what the
     * student was told and part-paid; changing it afterwards rewrites the sum a
     * receipt was printed from, and clearing it can put the payable below what
     * has already been handed over. Refund and re-enrol is the honest path for
     * that, not an edit here.
     */
    if (Number(existing.fee_paid) > 0) {
      throw badRequest(
        `A discount can only be set before the first payment. ${Number(existing.fee_paid)} has already been paid on this enrolment.`,
      );
    }

    // An empty type clears the discount and puts the fee back to the full one.
    if (b.type == null || b.type === '' || Number(b.value ?? 0) <= 0) {
      await db
        .updateTable('student_courses')
        .set({
          discount_type: null,
          discount_value: '0',
          discount_amount: '0',
          discount_reason: null,
          discount_approved_by: null,
          discount_applied_on: null,
          final_fee: String(fee),
          updated_at: new Date(),
        })
        .where('id', '=', enrolmentId)
        .execute();

      return res.json({ data: { fee, discount: 0, final_fee: fee } });
    }

    const type = oneOf(DISCOUNT_TYPE, b.type);
    const value = money(b.value, 'Discount');
    if (type === 'percent' && value > 100) throw badRequest('A percentage discount cannot exceed 100.');
    if (type === 'fixed' && value > fee) throw badRequest('The discount is more than the course fee.');

    const cut = discountOf(fee, type, value);
    const finalFee = fee - cut;
    if (finalFee < Number(existing.fee_paid)) {
      throw badRequest('That discount would put the fee below what has already been paid.');
    }

    await db
      .updateTable('student_courses')
      .set({
        discount_type: type,
        discount_value: String(value),
        discount_amount: String(cut),
        discount_reason: text(b.reason),
        // Who approved it is the signed-in administrator, not a name typed into
        // the form: an approval nobody can be held to is not an approval.
        discount_approved_by: req.user.id,
        discount_applied_on: date(b.applied_on) ?? new Date(),
        final_fee: String(finalFee),
        updated_at: new Date(),
      })
      .where('id', '=', enrolmentId)
      .execute();

    res.json({ data: { fee, discount: cut, final_fee: finalFee } });
  }),
);

/** A fee payment, added rather than replaced. */
courseRoutes.post(
  '/enrolments/:id/payment',
  numericId,
  wrap(async (req, res) => {
    const enrolmentId = Number(req.params.id);
    const paid = money(req.body?.amount, 'Amount');
    if (paid <= 0) throw badRequest('Enter an amount greater than zero.');

    const row = await db
      .selectFrom('student_courses')
      .select(['final_fee', 'fee_paid'])
      .where('id', '=', enrolmentId)
      .executeTakeFirst();
    if (!row) throw notFound('Enrolment not found.');

    const next = Number(row.fee_paid) + paid;
    if (next > Number(row.final_fee)) throw badRequest('That is more than the fee still due.');

    await db
      .updateTable('student_courses')
      .set({ fee_paid: String(next), updated_at: new Date() })
      .where('id', '=', enrolmentId)
      .execute();

    res.json({ data: { fee_paid: next, due: Number(row.final_fee) - next } });
  }),
);

/**
 * The fee on one enrolment, as a sheet to hand over.
 *
 * A statement, not a numbered receipt: nothing in the schema issues fee
 * receipt numbers, so the enrolment id is the reference. `?format=html`
 * returns the markup the PDF is rendered from, which is how the layout is
 * worked on without a render round trip.
 */
courseRoutes.get(
  '/enrolments/:id/statement',
  numericId,
  wrap(async (req, res) => {
    const enrolmentId = Number(req.params.id);
    const issuedBy = req.user?.fullname ?? 'IIGL';

    if (req.query.format === 'html') {
      res.type('html').send(await feeStatementHtml(enrolmentId, issuedBy));
      return;
    }

    const pdf = await feeStatementPdf(enrolmentId, issuedBy);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="fee-statement-${enrolmentId}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }),
);

courseRoutes.delete(
  '/enrolments/:id',
  numericId,
  wrap(async (req, res) => {
    const enrolmentId = Number(req.params.id);

    const certified = await db
      .selectFrom('student_certificates')
      .select('id')
      .where('student_course_id', '=', enrolmentId)
      .executeTakeFirst();
    if (certified) {
      throw conflict('A certificate has been issued against this enrolment.');
    }

    const result = await db
      .deleteFrom('student_courses')
      .where('id', '=', enrolmentId)
      .executeTakeFirst();
    if (!Number(result.numDeletedRows)) throw notFound('Enrolment not found.');
    res.json({ ok: true });
  }),
);
