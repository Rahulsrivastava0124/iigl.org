import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
import {
  courseCertificateHtml,
  courseCertificatePdf,
  type CertificateOrientation,
} from '../services/document.service.js';

/**
 * Course certificates — the last stage of the student pipeline.
 *
 * Not to be confused with `/api/reports`, the gemstone certificates the
 * laboratory issues. They are different documents for different people, and the
 * numbering says so: a course certificate is `IIGL-C-2026-0001-7QF4`, which no
 * report number resembles across a desk.
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

/**
 * The count that follows `last` within the year, and 1 when the year has none.
 *
 * `parseInt` stops at the dash before the random tail, so a number issued before
 * the tail existed (`IIGL-C-2026-0007`) and one issued after
 * (`IIGL-C-2026-0007-7QF4`) both read as 7. Exported for check:certificate-no,
 * because a count read wrong hands two students the same certificate number.
 */
export const nextCount = (last: string | null | undefined, prefix: string): number =>
  last ? parseInt(String(last).slice(prefix.length), 10) + 1 : 1;

/**
 * The tail's alphabet: digits and capitals without I, O, U or L, which are read
 * off a printed certificate as 1, 0, V and 1.
 */
const TAIL = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * IIGL-C-YYYY-NNNN-XXXX, counted within the year and finished with four random
 * characters, read and written in one transaction.
 *
 * The tail is what keeps the public check (`GET /api/public/student-certificates/:no`)
 * from being walked: the count alone is guessable, and a guess that lands returns
 * a student's name, course and grade. Certificates numbered before the tail
 * existed still verify — only the count has to be read past what follows it.
 */
async function nextCertificateNo(trx: typeof db): Promise<string> {
  const prefix = `IIGL-C-${new Date().getFullYear()}-`;

  const last = await trx
    .selectFrom('student_certificates')
    .select('certificate_no')
    .where('certificate_no', 'like', `${prefix}%`)
    .orderBy('certificate_no', 'desc')
    .executeTakeFirst();

  // randomInt, not a byte modulo: 256 does not divide by 30, and the remainder
  // would make the first letters of the alphabet likelier than the last.
  const tail = Array.from({ length: 4 }, () => TAIL[randomInt(TAIL.length)]).join('');
  return `${prefix}${String(nextCount(last?.certificate_no, prefix)).padStart(4, '0')}-${tail}`;
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

/**
 * The certificate as a sheet to hand over.
 *
 * Printed on the artwork the **course** carries, not on a layout defined here:
 * see courses.certificate_template. A course with nothing uploaded returns 404
 * naming the course, because the fix is an upload rather than a retry.
 *
 * Landscape unless asked otherwise. Most certificate stock is landscape, and
 * guessing from the image would mean decoding it just to choose a page size;
 * `?orientation=portrait` is the escape hatch for a design that is not.
 *
 * Registered before /:id so that PATCH and DELETE keep reading as the pair they
 * are, and `?format=html` returns the markup the PDF is rendered from — the
 * same convention as the fee statement and the order documents.
 */
studentCertificateRoutes.get(
  '/:id/print',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const orientation: CertificateOrientation =
      req.query.orientation === 'portrait' ? 'portrait' : 'landscape';

    if (req.query.format === 'html') {
      res.type('html').send(await courseCertificateHtml(id, orientation));
      return;
    }

    const pdf = await courseCertificatePdf(id, orientation);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${id}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
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
