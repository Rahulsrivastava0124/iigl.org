import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { sendStudentOtp } from '../lib/mail.js';
import {
  clearStudentSession,
  issueStudentSession,
  readStudentSession,
  type StudentSession,
} from '../lib/student-session.js';
import { feeStatementPdf, courseCertificatePdf } from '../services/document.service.js';
import {
  assertStudentPayment,
  confirmPayment,
  paymentConfig,
  startStudentEnrolmentPayment,
  startStudentRegistrationPayment,
} from '../services/payment.service.js';

/**
 * The student portal on the public website.
 *
 * A student signs in with a one-time code sent to the email on their record —
 * they identify themselves by the mobile number they registered with — and then
 * reads their own courses, fees and certificates. Everything here is scoped to
 * the one student in the session; nothing crosses to another.
 *
 * Mounted under `/api/public`, so it sits outside the staff sign-in guard and
 * carries its own `iigl.student` cookie instead.
 */
export const studentPortalRoutes = Router();

/** How long a code is good for, and how many tries it gets. */
const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

const money = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;

/** `rahul@gmail.com` → `rah••••@gmail.com`: enough to say which inbox to open. */
function maskEmail(email: string): string {
  const [name, host] = email.split('@');
  if (!host) return '•••';
  const head = name.slice(0, 3);
  return `${head}${'•'.repeat(Math.max(3, name.length - 3))}@${host}`;
}

/**
 * Who a mobile number signs in as, and whether a code can be sent.
 *
 * A number may be on more than one student — a parent's on two children, a
 * re-registration — so the most recent record with an email is preferred: it is
 * the one whose inbox a code can go to, and the newest is the live enrolment.
 * When some student holds the number but none has an email, that is reported
 * separately, so the login can say a code cannot be sent rather than pretend it
 * was.
 */
async function studentForLogin(
  mobile: string,
): Promise<{ status: 'none' } | { status: 'no_email' } | { status: 'ok'; student: { id: number; name: string; email: string } }> {
  const rows = await db
    .selectFrom('students')
    .select(['id', 'name', 'email'])
    .where('mobile', '=', mobile)
    .orderBy('id', 'desc')
    .execute();
  if (rows.length === 0) return { status: 'none' };
  const withEmail = rows.find((r) => r.email && r.email.includes('@'));
  if (!withEmail) return { status: 'no_email' };
  return { status: 'ok', student: { id: Number(withEmail.id), name: withEmail.name, email: withEmail.email as string } };
}

/* --------------------------------------------------------------- sign in */

studentPortalRoutes.post(
  '/otp',
  wrap(async (req, res) => {
    const mobile = String(req.body?.mobile ?? '').replace(/[\s()+.-]/g, '').trim();
    if (!/^\d{10,15}$/.test(mobile)) throw badRequest('Enter the mobile number you registered with.');

    const found = await studentForLogin(mobile);

    // A number nobody registered with is told so, rather than left waiting for a
    // code that is never coming.
    if (found.status === 'none') {
      res.json({ data: { registered: false, sent: false } });
      return;
    }
    // Registered, but with no email to send a code to: the office has to add one.
    if (found.status === 'no_email') {
      res.json({ data: { registered: true, sent: false, reason: 'no_email' } });
      return;
    }

    const { student } = found;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    const expires = new Date(now.getTime() + OTP_MINUTES * 60_000);
    const code_hash = await bcrypt.hash(code, 10);
    await db
      .insertInto('student_otps')
      .values({ student_id: student.id, code_hash, expires_at: expires, attempts: 0, created_at: now, updated_at: now })
      .onDuplicateKeyUpdate({ code_hash, expires_at: expires, attempts: 0, updated_at: now })
      .execute();
    await sendStudentOtp(student.email, code, student.name, OTP_MINUTES);
    res.json({ data: { registered: true, sent: true, to: maskEmail(student.email) } });
  }),
);

studentPortalRoutes.post(
  '/verify',
  wrap(async (req, res) => {
    const mobile = String(req.body?.mobile ?? '').replace(/[\s()+.-]/g, '').trim();
    const code = String(req.body?.code ?? '').trim();
    if (!/^\d{10,15}$/.test(mobile) || !/^\d{6}$/.test(code)) {
      throw badRequest('Enter the code sent to your email.');
    }

    const found = await studentForLogin(mobile);
    const student = found.status === 'ok' ? found.student : null;
    const otp = student
      ? await db.selectFrom('student_otps').selectAll().where('student_id', '=', student.id).executeTakeFirst()
      : null;
    if (!student || !otp) throw unauthorized('That code is not valid. Ask for a new one.');

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      throw unauthorized('That code has expired. Ask for a new one.');
    }
    if (Number(otp.attempts) >= OTP_MAX_ATTEMPTS) {
      throw unauthorized('Too many tries. Ask for a new code.');
    }

    const ok = await bcrypt.compare(code, otp.code_hash);
    if (!ok) {
      await db
        .updateTable('student_otps')
        .set({ attempts: Number(otp.attempts) + 1, updated_at: new Date() })
        .where('student_id', '=', student.id)
        .execute();
      throw unauthorized('That code is not valid. Check it, or ask for a new one.');
    }

    // Spent: a code signs in once, then is gone.
    await db.deleteFrom('student_otps').where('student_id', '=', student.id).execute();
    issueStudentSession(res, { id: student.id, name: student.name });
    res.json({ data: { id: student.id, name: student.name } });
  }),
);

studentPortalRoutes.post('/logout', (_req, res) => {
  clearStudentSession(res);
  res.json({ data: { ok: true } });
});

/* ------------------------------------------------------- the session guard */

/** The signed-in student, or a 401. Every read below goes through it. */
function requireStudent(req: Request, _res: Response, next: NextFunction) {
  const student = readStudentSession(req);
  if (!student) return next(unauthorized('Sign in to see your page.'));
  (req as Request & { student: StudentSession }).student = student;
  next();
}

const me = (req: Request) => (req as Request & { student: StudentSession }).student;

studentPortalRoutes.get(
  '/me',
  wrap(async (req, res) => {
    const student = readStudentSession(req);
    if (!student) throw unauthorized('Not signed in.');
    res.json({ data: student });
  }),
);

/* --------------------------------------------------------------- the pages */

studentPortalRoutes.get(
  '/profile',
  requireStudent,
  wrap(async (req, res) => {
    const s = await db
      .selectFrom('students as s')
      .leftJoin('courses as c', 'c.id', 's.course_id')
      .select([
        's.id', 's.name', 's.registration_no', 's.registration_date', 's.email', 's.mobile',
        's.alt_mobile', 's.father_name', 's.gender', 's.dob', 's.address', 's.city', 's.state',
        's.pincode', 's.photo', 's.id_proof', 's.qualification_doc', 's.extra_doc', 's.status',
        's.course_id', 'c.name as course_name',
      ])
      .where('s.id', '=', me(req).id)
      .executeTakeFirst();
    if (!s) throw notFound('Student not found.');
    res.json({ data: s });
  }),
);

studentPortalRoutes.get(
  '/enrolments',
  requireStudent,
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('student_courses as sc')
      .leftJoin('courses as c', 'c.id', 'sc.course_id')
      .select([
        'sc.id', 'sc.batch', 'sc.fee', 'sc.discount_amount', 'sc.final_fee', 'sc.gst_percent',
        'sc.gst_amount', 'sc.fee_paid', 'sc.status', 'sc.start_date', 'sc.end_date', 'sc.completed_on',
        'c.name as course_name',
      ])
      .where('sc.student_id', '=', me(req).id)
      .orderBy('sc.id', 'desc')
      .execute();

    const data = rows.map((r) => {
      const payable = money(r.final_fee) + money(r.gst_amount);
      return {
        ...r,
        payable,
        due: Math.round((payable - money(r.fee_paid)) * 100) / 100,
      };
    });
    res.json({ data });
  }),
);

/** Fees, folded across the enrolments: what is payable, paid and still due. */
studentPortalRoutes.get(
  '/fees',
  requireStudent,
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('student_courses as sc')
      .leftJoin('courses as c', 'c.id', 'sc.course_id')
      .select(['sc.id', 'sc.batch', 'sc.final_fee', 'sc.gst_amount', 'sc.fee_paid', 'c.name as course_name'])
      .where('sc.student_id', '=', me(req).id)
      .orderBy('sc.id', 'desc')
      .execute();

    let payable = 0;
    let paid = 0;
    const lines = rows.map((r) => {
      const p = money(r.final_fee) + money(r.gst_amount);
      const pd = money(r.fee_paid);
      payable += p;
      paid += pd;
      return { id: r.id, course_name: r.course_name, batch: r.batch, payable: p, paid: pd, due: Math.round((p - pd) * 100) / 100 };
    });
    res.json({
      data: {
        lines,
        payable: Math.round(payable * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        due: Math.round((payable - paid) * 100) / 100,
      },
    });
  }),
);

/** A fee statement for one of the student's own enrolments. */
studentPortalRoutes.get(
  '/enrolments/:id/statement',
  requireStudent,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const own = await db
      .selectFrom('student_courses')
      .select('id')
      .where('id', '=', id)
      .where('student_id', '=', me(req).id)
      .executeTakeFirst();
    if (!own) throw notFound('Enrolment not found.');

    const pdf = await feeStatementPdf(id, me(req).name);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="fee-statement-${id}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }),
);

/* --------------------------------------------------------- online payment */

/** Whether the portal may offer online payment, and whether it is test mode. */
studentPortalRoutes.get('/payments/config', (_req, res) => {
  res.json({ data: paymentConfig() });
});

/**
 * Start paying (part of) the fee on one of the student's own enrolments. The
 * reply carries the Cashfree session the browser opens the checkout with;
 * nothing is recorded paid until the confirm below reads it back from Cashfree.
 */
studentPortalRoutes.post(
  '/enrolments/:id/pay',
  requireStudent,
  wrap(async (req, res) => {
    const enrolmentId = Number(req.params.id);
    const amountRaw = req.body?.amount;
    const amount = amountRaw === undefined || amountRaw === null || amountRaw === '' ? null : Number(amountRaw);
    const started = await startStudentEnrolmentPayment(me(req).id, enrolmentId, amount);
    res.status(201).json({ data: started });
  }),
);

/**
 * Start paying the fee for the course the student registered for but is not
 * yet enrolled on. Confirmed through the same `/payments/:orderId/confirm`.
 */
studentPortalRoutes.post(
  '/registration/pay',
  requireStudent,
  wrap(async (req, res) => {
    res.status(201).json({ data: await startStudentRegistrationPayment(me(req).id) });
  }),
);

/**
 * The student withdrawing their own registration. Only while it is pending and
 * nothing has been enrolled or paid on it: after that it is head office's call.
 */
studentPortalRoutes.post(
  '/registration/cancel',
  requireStudent,
  wrap(async (req, res) => {
    const id = me(req).id;
    const enrolled = await db.selectFrom('student_courses').select('id').where('student_id', '=', id).executeTakeFirst();
    if (enrolled) throw badRequest('You are already enrolled. Please contact the institute to cancel.');
    const done = await db
      .updateTable('students')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (!Number(done.numUpdatedRows)) throw badRequest('Only a pending registration can be cancelled here. Please contact the institute.');
    res.json({ data: { status: 'cancelled' } });
  }),
);

/** Where a portal fee payment stands; if just paid, the fee is recorded now. */
studentPortalRoutes.post(
  '/payments/:orderId/confirm',
  requireStudent,
  wrap(async (req, res) => {
    const orderId = String(req.params.orderId);
    await assertStudentPayment(orderId, me(req).id);
    res.json({ data: await confirmPayment(orderId) });
  }),
);

studentPortalRoutes.get(
  '/certificates',
  requireStudent,
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('student_certificates as cert')
      .leftJoin('student_courses as sc', 'sc.id', 'cert.student_course_id')
      .leftJoin('courses as c', 'c.id', 'sc.course_id')
      .select([
        'cert.id', 'cert.certificate_no', 'cert.issued_on', 'cert.grade', 'cert.file',
        'c.name as course_name',
      ])
      .where('cert.student_id', '=', me(req).id)
      .orderBy('cert.id', 'desc')
      .execute();
    res.json({ data: rows });
  }),
);

/** One of the student's own certificates, as a PDF on the course artwork. */
studentPortalRoutes.get(
  '/certificates/:id/download',
  requireStudent,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const cert = await db
      .selectFrom('student_certificates')
      .select('id')
      .where('id', '=', id)
      .where('student_id', '=', me(req).id)
      .executeTakeFirst();
    if (!cert) throw notFound('Certificate not found.');

    const pdf = await courseCertificatePdf(id, 'landscape');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${id}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }),
);
