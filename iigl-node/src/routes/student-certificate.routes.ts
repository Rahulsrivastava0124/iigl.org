import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';

/**
 * Course certificates — the last stage of the student pipeline.
 *
 * Not to be confused with `/api/reports`, the gemstone certificates the
 * laboratory issues. They are different documents for different people, and the
 * numbering says so: a course certificate is `IIGL-C-2026-0001`, twelve digits
 * shorter than a report number and impossible to mistake for one across a desk.
 *
 * Issued against a **completed enrolment**, not against a student: somebody who
 * takes two courses earns two certificates, and a certificate for a course
 * nobody has finished is the one thing this screen must not be able to produce.
 */
export const studentCertificateRoutes = Router();
studentCertificateRoutes.use(requireAdmin);

const text = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim());

const date = (v: unknown): Date | null => {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest(`${s} is not a date.`);
  return d;
};

/** IIGL-C-YYYY-NNNN, counted within the year, read and written in one transaction. */
async function nextCertificateNo(trx: typeof db): Promise<string> {
  const prefix = `IIGL-C-${new Date().getFullYear()}-`;

  const last = await trx
    .selectFrom('student_certificates')
    .select('certificate_no')
    .where('certificate_no', 'like', `${prefix}%`)
    .orderBy('certificate_no', 'desc')
    .executeTakeFirst();

  const n = last ? Number(String(last.certificate_no).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

function certificateQuery() {
  return db
    .selectFrom('student_certificates as cert')
    .leftJoin('students as s', 's.id', 'cert.student_id')
    .leftJoin('student_courses as sc', 'sc.id', 'cert.student_course_id')
    .leftJoin('courses as c', 'c.id', 'sc.course_id')
    .select([
      'cert.id',
      'cert.certificate_no',
      'cert.student_id',
      'cert.student_course_id',
      'cert.issued_on',
      'cert.grade',
      'cert.remark',
      'cert.file',
      's.name as student_name',
      's.registration_no',
      's.mobile',
      'c.name as course_name',
      'sc.batch',
      'sc.completed_on',
    ]);
}

studentCertificateRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req);
    const term = String(req.query.q ?? '').trim();
    const studentId = req.query.student_id ? Number(req.query.student_id) : null;

    const build = (base: any) => {
      let q = base;
      if (studentId) q = q.where('cert.student_id', '=', studentId);
      if (term) {
        const like = `%${term}%`;
        q = q.where((eb: any) =>
          eb.or([
            eb('cert.certificate_no', 'like', like),
            eb('s.name', 'like', like),
            eb('s.registration_no', 'like', like),
            eb('c.name', 'like', like),
          ]),
        );
      }
      return q;
    };

    const [rows, count] = await Promise.all([
      build(certificateQuery()).orderBy('cert.id', 'desc').limit(p.limit).offset(p.offset).execute(),
      build(
        db
          .selectFrom('student_certificates as cert')
          .leftJoin('students as s', 's.id', 'cert.student_id')
          .leftJoin('student_courses as sc', 'sc.id', 'cert.student_course_id')
          .leftJoin('courses as c', 'c.id', 'sc.course_id')
          .select(db.fn.countAll().as('n')),
      ).executeTakeFirstOrThrow(),
    ]);

    res.json(paged(rows, Number(count.n), p));
  }),
);

/**
 * Enrolments that have finished and have no certificate yet — what this screen
 * is for. Without it, issuing means hunting through the enrolment list for the
 * completed ones.
 */
studentCertificateRoutes.get(
  '/pending',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('student_courses as sc')
      .leftJoin('students as s', 's.id', 'sc.student_id')
      .leftJoin('courses as c', 'c.id', 'sc.course_id')
      .leftJoin('student_certificates as cert', 'cert.student_course_id', 'sc.id')
      .select([
        'sc.id',
        'sc.student_id',
        'sc.batch',
        'sc.completed_on',
        'sc.result',
        's.name as student_name',
        's.registration_no',
        'c.name as course_name',
      ])
      .where('sc.status', '=', 'completed')
      .where('cert.id', 'is', null)
      .orderBy('sc.completed_on', 'desc')
      .execute();

    res.json({ data: rows });
  }),
);

studentCertificateRoutes.post(
  '/',
  wrap(async (req, res) => {
    const b = req.body ?? {};
    const enrolmentId = Number(b.student_course_id);
    if (!enrolmentId) throw badRequest('An enrolment is required.');

    const enrolment = await db
      .selectFrom('student_courses')
      .selectAll()
      .where('id', '=', enrolmentId)
      .executeTakeFirst();
    if (!enrolment) throw notFound('Enrolment not found.');

    if (enrolment.status !== 'completed') {
      throw badRequest('The course is not finished, so there is nothing to certify yet.');
    }

    const already = await db
      .selectFrom('student_certificates')
      .select('id')
      .where('student_course_id', '=', enrolmentId)
      .executeTakeFirst();
    if (already) throw conflict('A certificate has already been issued for this enrolment.');

    const certificate = await db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto('student_certificates')
        .values({
          student_course_id: enrolmentId,
          student_id: Number(enrolment.student_id),
          certificate_no: await nextCertificateNo(trx),
          issued_on: date(b.issued_on) ?? new Date(),
          grade: text(b.grade),
          remark: text(b.remark),
          file: text(b.file),
          issued_by: req.user.id,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .executeTakeFirstOrThrow();

      return Number(inserted.insertId);
    });

    const row = await certificateQuery().where('cert.id', '=', certificate).executeTakeFirstOrThrow();
    res.status(201).json({ data: row });
  }),
);

studentCertificateRoutes.patch(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const certificateId = Number(req.params.id);
    const existing = await db
      .selectFrom('student_certificates')
      .select('id')
      .where('id', '=', certificateId)
      .executeTakeFirst();
    if (!existing) throw notFound('Certificate not found.');

    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (b.issued_on !== undefined) patch.issued_on = date(b.issued_on);
    if (b.grade !== undefined) patch.grade = text(b.grade);
    if (b.remark !== undefined) patch.remark = text(b.remark);
    if (b.file !== undefined) patch.file = text(b.file);

    // The number is not editable. It is printed on a document somebody else is
    // holding, and the whole point of the series is that it identifies one.
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update.');
    patch.updated_at = new Date();

    await db
      .updateTable('student_certificates')
      .set(patch)
      .where('id', '=', certificateId)
      .execute();
    res.json({ ok: true });
  }),
);

studentCertificateRoutes.delete(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const result = await db
      .deleteFrom('student_certificates')
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!Number(result.numDeletedRows)) throw notFound('Certificate not found.');
    res.json({ ok: true });
  }),
);
