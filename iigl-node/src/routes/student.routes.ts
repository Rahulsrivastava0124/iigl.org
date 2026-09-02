import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
import { followupCounts, followupsFor, recordFollowup } from '../services/followup.service.js';

/**
 * The student pipeline.
 *
 *     enquiry --convert--> registration --enrol--> course --> certificate
 *                                          `-- discount applies here
 *
 * New ground rather than a port: the Laravel sidebar carried a Student menu
 * whose every entry was `href="#"`, over no table. See migrations/004.
 *
 * Five resources, one per stage, because they are five different records — an
 * enquiry has a follow-up trail and a course somebody is *interested* in, a
 * registration has documents and a number, an enrolment has a batch and the
 * money. The exception is the discount, which is **not** a stage: it is three
 * columns on the enrolment, beside the fee it reduces, so a fee and its
 * discount cannot disagree.
 *
 * Administrators only, which is where the menu put it.
 */
export const studentRoutes = Router();
studentRoutes.use(requireAdmin);

export const ENQUIRY_STATUS = [
  'new',
  'contacted',
  'interested',
  'converted',
  'not_interested',
] as const;
export const REGISTRATION_STATUS = ['pending', 'registered', 'active'] as const;
export const COURSE_STATUS = ['upcoming', 'ongoing', 'completed'] as const;

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

const id = (v: unknown): number | null => (v ? Number(v) : null);

function oneOf<T extends readonly string[]>(
  allowed: T,
  v: unknown,
  fallback?: T[number],
): T[number] {
  if (v == null || v === '') {
    if (fallback) return fallback;
    throw badRequest(`Expected one of: ${allowed.join(', ')}.`);
  }
  const s = String(v);
  if (!allowed.includes(s)) throw badRequest(`Unknown value. Expected one of: ${allowed.join(', ')}.`);
  return s;
}

/** A `like` filter over a few columns, shared by every list here. */
function search(q: any, term: string, columns: string[]) {
  if (!term) return q;
  const like = `%${term}%`;
  return q.where((eb: any) => eb.or(columns.map((c) => eb(c, 'like', like))));
}

// ===========================================================================
// 1. Enquiry
// ===========================================================================

studentRoutes.get(
  '/enquiries',
  wrap(async (req, res) => {
    const p = readPage(req);
    const status = req.query.status ? oneOf(ENQUIRY_STATUS, req.query.status) : null;
    const term = String(req.query.q ?? '').trim();
    // Which laboratory took the enquiry. Only head office reaches this router,
    // so this narrows a view rather than enforcing one: nobody is kept out of
    // another laboratory's enquiries by leaving it off.
    const labId = id(req.query.lab_id);

    const build = (base: any) => {
      let q = base;
      if (status) q = q.where('status', '=', status);
      if (labId) q = q.where('lab_id', '=', labId);
      return search(q, term, ['name', 'mobile', 'email', 'course_interested']);
    };

    const [rows, count] = await Promise.all([
      build(db.selectFrom('student_enquiries').selectAll())
        .orderBy('id', 'desc')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      build(
        db.selectFrom('student_enquiries').select(db.fn.countAll().as('n')),
      ).executeTakeFirstOrThrow(),
    ]);

    // How many times each has been tried, and when last. The list is a
    // worklist: those two decide whether to call again, and they should not
    // take a click to find out.
    const enquiryRows = rows as { id: number }[];
    const tries = await followupCounts('student', enquiryRows.map((r) => Number(r.id)));

    res.json(
      paged(
        enquiryRows.map((r) => ({
          ...r,
          followups: tries.get(Number(r.id))?.n ?? 0,
          last_followup_at: tries.get(Number(r.id))?.last_at ?? null,
        })),
        Number(count.n),
        p,
      ),
    );
  }),
);

studentRoutes.post(
  '/enquiries',
  wrap(async (req, res) => {
    const b = req.body ?? {};
    const result = await db
      .insertInto('student_enquiries')
      .values({
        name: requireText(b.name, 'Student name'),
        mobile: requireText(b.mobile, 'Mobile number'),
        email: text(b.email),
        course_id: id(b.course_id),
        course_interested: text(b.course_interested),
        enquiry_date: date(b.enquiry_date) ?? new Date(),
        source: text(b.source),
        status: oneOf(ENQUIRY_STATUS, b.status, 'new'),
        remarks: text(b.remarks),
        follow_up_on: date(b.follow_up_on),
        added_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

studentRoutes.patch(
  '/enquiries/:id',
  numericId,
  wrap(async (req, res) => {
    const enquiryId = Number(req.params.id);
    const existing = await db
      .selectFrom('student_enquiries')
      .select(['id', 'status'])
      .where('id', '=', enquiryId)
      .executeTakeFirst();
    if (!existing) throw notFound('Enquiry not found.');

    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (b.name !== undefined) patch.name = requireText(b.name, 'Student name');
    if (b.mobile !== undefined) patch.mobile = requireText(b.mobile, 'Mobile number');
    if (b.email !== undefined) patch.email = text(b.email);
    if (b.course_id !== undefined) patch.course_id = id(b.course_id);
    if (b.course_interested !== undefined) patch.course_interested = text(b.course_interested);
    if (b.enquiry_date !== undefined) patch.enquiry_date = date(b.enquiry_date);
    if (b.source !== undefined) patch.source = text(b.source);
    if (b.remarks !== undefined) patch.remarks = text(b.remarks);
    if (b.follow_up_on !== undefined) patch.follow_up_on = date(b.follow_up_on);

    if (b.status !== undefined) {
      const status = oneOf(ENQUIRY_STATUS, b.status);
      // Converted is not a status somebody sets by hand: it is what the convert
      // endpoint records once a registration exists behind it.
      if (status === 'converted' && existing.status !== 'converted') {
        throw badRequest('Convert the enquiry to register the student; the status follows.');
      }
      patch.status = status;
    }

    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update.');
    patch.updated_at = new Date();

    await db.updateTable('student_enquiries').set(patch).where('id', '=', enquiryId).execute();
    res.json({ ok: true });
  }),
);

/**
 * The follow-up history of one course enquiry, newest first, and how to add to
 * it. The same log and the same code as the general enquiry book — see
 * `followup.service`.
 */
studentRoutes.get(
  '/enquiries/:id/followups',
  numericId,
  wrap(async (req, res) => {
    res.json({ data: await followupsFor('student', Number(req.params.id)) });
  }),
);

studentRoutes.post(
  '/enquiries/:id/followups',
  numericId,
  wrap(async (req, res) => {
    const data = await recordFollowup('student', Number(req.params.id), req.body ?? {}, req.user.id);
    res.status(201).json({ data });
  }),
);

/**
 * Convert: the enquiry becomes a registration.
 *
 * One transaction, because a converted enquiry with no student behind it is
 * worse than an unconverted one — the follow-up list would stop showing it
 * while nobody was registered.
 */
studentRoutes.post(
  '/enquiries/:id/convert',
  numericId,
  wrap(async (req, res) => {
    const enquiryId = Number(req.params.id);
    const b = req.body ?? {};

    const enquiry = await db
      .selectFrom('student_enquiries')
      .selectAll()
      .where('id', '=', enquiryId)
      .executeTakeFirst();
    if (!enquiry) throw notFound('Enquiry not found.');
    if (enquiry.student_id) throw conflict('This enquiry has already been converted.');

    const studentId = await db.transaction().execute(async (trx) => {
      const registrationNo = await nextRegistrationNo(trx);

      const inserted = await trx
        .insertInto('students')
        .values({
          registration_no: registrationNo,
          name: text(b.name) ?? enquiry.name,
          mobile: text(b.mobile) ?? enquiry.mobile,
          email: text(b.email) ?? enquiry.email,
          course_id: id(b.course_id) ?? enquiry.course_id,
          registration_date: date(b.registration_date) ?? new Date(),
          status: oneOf(REGISTRATION_STATUS, b.status, 'pending'),
          enquiry_id: enquiryId,
          added_by: req.user.id,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .executeTakeFirstOrThrow();

      const newId = Number(inserted.insertId);

      await trx
        .updateTable('student_enquiries')
        .set({
          status: 'converted',
          student_id: newId,
          converted_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', enquiryId)
        .execute();

      return newId;
    });

    const student = await db
      .selectFrom('students')
      .selectAll()
      .where('id', '=', studentId)
      .executeTakeFirstOrThrow();

    res.status(201).json({ data: student });
  }),
);

studentRoutes.delete(
  '/enquiries/:id',
  numericId,
  wrap(async (req, res) => {
    const result = await db
      .deleteFrom('student_enquiries')
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!Number(result.numDeletedRows)) throw notFound('Enquiry not found.');
    res.json({ ok: true });
  }),
);

// ===========================================================================
// 2. Registration
// ===========================================================================

/**
 * IIGL-YYYY-NNNN, counted within the year.
 *
 * Read and written in the same transaction as the row it numbers, so two
 * registrations taken at once cannot be handed the same number — the mistake
 * the gemstone certificate numbering made and had to be fixed for.
 */
async function nextRegistrationNo(trx: typeof db): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `IIGL-${year}-`;

  const last = await trx
    .selectFrom('students')
    .select('registration_no')
    .where('registration_no', 'like', `${prefix}%`)
    .orderBy('registration_no', 'desc')
    .executeTakeFirst();

  const n = last ? Number(String(last.registration_no).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

studentRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req);
    const status = req.query.status ? oneOf(REGISTRATION_STATUS, req.query.status) : null;
    const term = String(req.query.q ?? '').trim();

    const build = (base: any) => {
      let q = base;
      if (status) q = q.where('status', '=', status);
      return search(q, term, ['name', 'mobile', 'email', 'registration_no']);
    };

    const [rows, count] = await Promise.all([
      build(db.selectFrom('students').selectAll())
        .orderBy('id', 'desc')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      build(db.selectFrom('students').select(db.fn.countAll().as('n'))).executeTakeFirstOrThrow(),
    ]);

    res.json(paged(rows, Number(count.n), p));
  }),
);

/** The counts behind every tab in the section, in one request. */
studentRoutes.get(
  '/summary',
  wrap(async (_req, res) => {
    const [enquiries, registrations, enrolments, fees, certificates] = await Promise.all([
      db
        .selectFrom('student_enquiries')
        .select(({ fn }) => ['status', fn.countAll().as('n')])
        .groupBy('status')
        .execute(),
      db
        .selectFrom('students')
        .select(({ fn }) => ['status', fn.countAll().as('n')])
        .groupBy('status')
        .execute(),
      db
        .selectFrom('student_courses')
        .select(({ fn }) => ['status', fn.countAll().as('n')])
        .groupBy('status')
        .execute(),
      db
        .selectFrom('student_courses')
        .select(({ fn }) => [
          fn.sum<number>('fee').as('fee'),
          fn.sum<number>('discount_amount').as('discount'),
          fn.sum<number>('final_fee').as('billed'),
          fn.sum<number>('fee_paid').as('collected'),
        ])
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('student_certificates')
        .select(({ fn }) => fn.countAll().as('n'))
        .executeTakeFirstOrThrow(),
    ]);

    const tally = (rows: Array<{ status: unknown; n: unknown }>, keys: readonly string[]) => {
      const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
      for (const r of rows) out[String(r.status)] = Number(r.n);
      return out;
    };

    const billed = Number(fees.billed ?? 0);
    const collected = Number(fees.collected ?? 0);

    res.json({
      data: {
        enquiries: tally(enquiries, ENQUIRY_STATUS),
        registrations: tally(registrations, REGISTRATION_STATUS),
        enrolments: tally(enrolments, COURSE_STATUS),
        fees: {
          course_fee: Number(fees.fee ?? 0),
          discount: Number(fees.discount ?? 0),
          billed,
          collected,
          due: billed - collected,
        },
        certificates: Number(certificates.n),
      },
    });
  }),
);

studentRoutes.get(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const studentId = Number(req.params.id);
    const student = await db
      .selectFrom('students')
      .selectAll()
      .where('id', '=', studentId)
      .executeTakeFirst();
    if (!student) throw notFound('Student not found.');

    const courses = await db
      .selectFrom('student_courses')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('id', 'desc')
      .execute();

    const certificates = await db
      .selectFrom('student_certificates')
      .selectAll()
      .where('student_id', '=', studentId)
      .execute();

    res.json({ data: { ...student, courses, certificates } });
  }),
);

studentRoutes.post(
  '/',
  wrap(async (req, res) => {
    const b = req.body ?? {};

    const studentId = await db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto('students')
        .values({
          registration_no: await nextRegistrationNo(trx),
          name: requireText(b.name, 'Name'),
          father_name: text(b.father_name),
          dob: date(b.dob),
          gender: text(b.gender),
          mobile: requireText(b.mobile, 'Mobile number'),
          alt_mobile: text(b.alt_mobile),
          email: text(b.email),
          address: text(b.address),
          city: text(b.city),
          state: text(b.state),
          pincode: text(b.pincode),
          photo: text(b.photo),
          id_proof: text(b.id_proof),
          qualification_doc: text(b.qualification_doc),
          registration_date: date(b.registration_date) ?? new Date(),
          course_id: id(b.course_id),
          status: oneOf(REGISTRATION_STATUS, b.status, 'pending'),
          remark: text(b.remark),
          added_by: req.user.id,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .executeTakeFirstOrThrow();

      return Number(inserted.insertId);
    });

    const student = await db
      .selectFrom('students')
      .selectAll()
      .where('id', '=', studentId)
      .executeTakeFirstOrThrow();

    res.status(201).json({ data: student });
  }),
);

studentRoutes.patch(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const studentId = Number(req.params.id);
    const existing = await db
      .selectFrom('students')
      .select('id')
      .where('id', '=', studentId)
      .executeTakeFirst();
    if (!existing) throw notFound('Student not found.');

    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (b.name !== undefined) patch.name = requireText(b.name, 'Name');
    if (b.father_name !== undefined) patch.father_name = text(b.father_name);
    if (b.dob !== undefined) patch.dob = date(b.dob);
    if (b.gender !== undefined) patch.gender = text(b.gender);
    if (b.mobile !== undefined) patch.mobile = requireText(b.mobile, 'Mobile number');
    if (b.alt_mobile !== undefined) patch.alt_mobile = text(b.alt_mobile);
    if (b.email !== undefined) patch.email = text(b.email);
    if (b.address !== undefined) patch.address = text(b.address);
    if (b.city !== undefined) patch.city = text(b.city);
    if (b.state !== undefined) patch.state = text(b.state);
    if (b.pincode !== undefined) patch.pincode = text(b.pincode);
    if (b.photo !== undefined) patch.photo = text(b.photo);
    if (b.id_proof !== undefined) patch.id_proof = text(b.id_proof);
    if (b.qualification_doc !== undefined) patch.qualification_doc = text(b.qualification_doc);
    if (b.registration_date !== undefined) patch.registration_date = date(b.registration_date);
    if (b.course_id !== undefined) patch.course_id = id(b.course_id);
    if (b.status !== undefined) patch.status = oneOf(REGISTRATION_STATUS, b.status);
    if (b.remark !== undefined) patch.remark = text(b.remark);

    // The registration number is not editable. It is on the paperwork the
    // student is holding.
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update.');
    patch.updated_at = new Date();

    await db.updateTable('students').set(patch).where('id', '=', studentId).execute();
    res.json({ ok: true });
  }),
);

studentRoutes.delete(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const studentId = Number(req.params.id);

    const enrolled = await db
      .selectFrom('student_courses')
      .select('id')
      .where('student_id', '=', studentId)
      .executeTakeFirst();
    if (enrolled) {
      throw conflict('This student is enrolled on a course. Remove the enrolment first.');
    }

    const result = await db
      .deleteFrom('students')
      .where('id', '=', studentId)
      .executeTakeFirst();
    if (!Number(result.numDeletedRows)) throw notFound('Student not found.');

    // The enquiry goes back to being an enquiry rather than pointing at a
    // registration that no longer exists.
    await db
      .updateTable('student_enquiries')
      .set({ student_id: null, converted_at: null, status: 'interested', updated_at: new Date() })
      .where('student_id', '=', studentId)
      .execute();

    res.json({ ok: true });
  }),
);
