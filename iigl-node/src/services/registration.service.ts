import { db } from '../db/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { nextRegistrationNo } from '../routes/student.routes.js';
import { STATUS, TRANSACTION_TYPE } from './commission.service.js';

/** Head office's account: where every course fee is received. */
const HEAD_OFFICE_ACCOUNT = 1;

/**
 * A course fee received, as a transaction in head office's Wallet. Every way a
 * fee is taken — the desk, an enrolment made with money already paid, online —
 * goes through here, so the Wallet and the enrolment's `fee_paid` move together.
 * A negative amount (fee paid corrected down) is recorded as money going back.
 */
export async function recordCourseFee(
  trx: typeof db,
  input: { enrolmentId: number; amount: number; payMode: string; transactionNo?: string | null; remark: string },
) {
  const amount = Math.round(input.amount * 100) / 100;
  if (amount === 0) return;
  const now = new Date();
  await trx
    .insertInto('transactions')
    .values({
      amount: String(Math.abs(amount)),
      comission_on: null,
      transaction_type: TRANSACTION_TYPE.COURSE_FEE,
      order_id: null,
      student_course_id: input.enrolmentId,
      pay_mode: input.payMode,
      transaction_no: input.transactionNo ?? null,
      remark: input.remark,
      attachment: null,
      // A student has no account: 0, the same "nobody" a walk-in collection uses.
      send_by: amount > 0 ? 0 : HEAD_OFFICE_ACCOUNT,
      received_by: amount > 0 ? HEAD_OFFICE_ACCOUNT : 0,
      status: STATUS.APPROVED,
      seen_by_sender: 1,
      seen_by_receiver: 1,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

/**
 * A student registering for a course: the checks and the write shared by the
 * website's free registration, its paid one, and the panel's "Register & pay
 * online" — so all three accept the same details and refuse the same way.
 */

const GENDERS = ['female', 'male', 'other'];

export interface RegistrationDetails {
  name: string;
  father_name: string | null;
  dob: string | null;
  gender: string | null;
  mobile: string;
  alt_mobile: string | null;
  email: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  message: string | null;
  course_id: number;
  /** Panel only: documents already uploaded by head office. */
  photo?: string | null;
  id_proof?: string | null;
  qualification_doc?: string | null;
}

export interface CourseForRegistration {
  id: number;
  name: string;
  fee: number;
  gst_percent: number;
  gst_amount: number;
  /** Fee plus GST: what the student pays. */
  total: number;
}

/** The GST rate a course is quoted at, as a percent, or 0 where it names none. */
export async function courseGstPercent(course: { gst_id?: number | null; gst_percent?: string | null }) {
  if (course.gst_id) {
    const rate = await db.selectFrom('gst_rates').select('percent').where('id', '=', Number(course.gst_id)).executeTakeFirst();
    return rate ? Number(rate.percent) : 0;
  }
  return course.gst_percent == null ? 0 : Number(course.gst_percent);
}

/** GST on an amount, to the paisa. */
export const gstOn = (amount: number, percent: number) => Math.round(amount * (percent / 100) * 100) / 100;

/** An active course, with what registering for it costs. */
export async function courseForRegistration(courseId: unknown): Promise<CourseForRegistration> {
  const course = await db
    .selectFrom('courses')
    .select(['id', 'name', 'title', 'fee', 'gst_id', 'gst_percent'])
    .where('id', '=', Number(courseId) || 0)
    .where('is_active', '=', 1)
    .executeTakeFirst();
  if (!course) throw notFound('Course not found.');
  const fee = Number(course.fee ?? 0);
  const percent = await courseGstPercent(course);
  const gst = gstOn(fee, percent);
  return {
    id: Number(course.id),
    name: String(course.title || course.name || ''),
    fee,
    gst_percent: percent,
    gst_amount: gst,
    total: Math.round((fee + gst) * 100) / 100,
  };
}

/** The registration form, checked. Throws a 400 naming the first problem. */
export function readRegistration(b: Record<string, unknown>, { documents = false } = {}): RegistrationDetails {
  const clean = (v: unknown) => String(v ?? '').trim();
  const capped = (key: string, label: string, max: number): string | null => {
    const v = clean(b[key]);
    if (v.length > max) throw badRequest(`${label} is at most ${max} characters.`);
    return v || null;
  };
  const phone = (key: string, label: string, needed: boolean): string | null => {
    const v = clean(b[key]).replace(/[\s-]/g, '');
    if (!v && !needed) return null;
    if (!/^\+?\d{10,15}$/.test(v)) throw badRequest(`Enter a valid ${label}.`);
    return v;
  };

  const name = capped('name', 'Name', 150);
  if (!name) throw badRequest('Enter your name.');
  const mobile = phone('mobile', 'mobile number', true) as string;
  const email = clean(b.email);
  if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('Enter a valid email address — the confirmation is sent there.');
  }
  const dob = clean(b.dob) || null;
  if (
    dob &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(dob) ||
      Number.isNaN(Date.parse(`${dob}T00:00:00Z`)) ||
      dob >= new Date().toISOString().slice(0, 10))
  ) {
    throw badRequest('Date of birth must be a past date.');
  }
  const gender = clean(b.gender) || null;
  if (gender && !GENDERS.includes(gender)) throw badRequest('Gender is female, male or other.');
  const pincode = clean(b.pincode) || null;
  if (pincode && !/^\d{6}$/.test(pincode)) throw badRequest('Pincode is six digits.');
  const courseId = Number(b.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) throw badRequest('Choose a course.');

  return {
    name,
    father_name: capped('father_name', 'Father / guardian name', 150),
    dob,
    gender,
    mobile,
    alt_mobile: phone('alt_mobile', 'alternate number', false),
    email,
    address: capped('address', 'Address', 255),
    city: capped('city', 'City', 100),
    state: capped('state', 'State', 100),
    pincode,
    message: capped('message', 'Message', 1000),
    course_id: courseId,
    ...(documents
      ? {
          photo: capped('photo', 'Photo', 255),
          id_proof: capped('id_proof', 'ID proof', 255),
          qualification_doc: capped('qualification_doc', 'Qualification document', 255),
        }
      : {}),
  };
}

/** Refuses a second registration for the same number on the same course that is still open. */
export async function assertNotRegistered(mobile: string, course: { id: number; name: string }) {
  const again = await db
    .selectFrom('students')
    .select('id')
    .where('mobile', '=', mobile)
    .where('course_id', '=', course.id)
    .where('status', 'in', ['pending', 'registered', 'active'])
    .executeTakeFirst();
  if (again) throw conflict(`This mobile number is already registered for ${course.name}. Our team will call you shortly.`);
}

/**
 * Writes the student. With `paid` it also enrols them on the course with the
 * fee and its GST copied from the catalogue as they stand now and the amount
 * paid recorded, and makes the registration active — the fee is the
 * confirmation a pending registration otherwise waits for.
 */
export async function insertRegistration(
  trx: typeof db,
  d: RegistrationDetails,
  course: CourseForRegistration,
  opts: {
    remark: string;
    addedBy: number | null;
    paid?: { amount: number; reference: string; payMode?: string; transactionNo?: string | null };
  },
): Promise<{ studentId: number; registrationNo: string; enrolmentId: number | null }> {
  const registrationNo = await nextRegistrationNo(trx);
  const now = new Date();
  const inserted = await trx
    .insertInto('students')
    .values({
      registration_no: registrationNo,
      name: d.name,
      father_name: d.father_name,
      // The 'YYYY-MM-DD' text as given: a Date would be shifted by the server's timezone.
      dob: d.dob as never,
      gender: d.gender,
      mobile: d.mobile,
      alt_mobile: d.alt_mobile,
      email: d.email,
      address: d.address,
      city: d.city,
      state: d.state,
      pincode: d.pincode,
      photo: d.photo ?? null,
      id_proof: d.id_proof ?? null,
      qualification_doc: d.qualification_doc ?? null,
      registration_date: now,
      course_id: course.id,
      status: opts.paid ? 'active' : 'pending',
      remark: [opts.remark, d.message].filter(Boolean).join(' '),
      added_by: opts.addedBy,
      created_at: now,
      updated_at: now,
    })
    .executeTakeFirstOrThrow();
  const studentId = Number(inserted.insertId);

  let enrolmentId: number | null = null;
  if (opts.paid) {
    const enrolment = await trx
      .insertInto('student_courses')
      .values({
        student_id: studentId,
        course_id: course.id,
        fee: String(course.fee),
        final_fee: String(course.fee),
        gst_percent: String(course.gst_percent),
        gst_amount: String(course.gst_amount),
        fee_paid: String(opts.paid.amount),
        status: 'upcoming',
        remark: `Fee paid online (${opts.paid.reference}).`,
        added_by: opts.addedBy,
        created_at: now,
        updated_at: now,
      })
      .executeTakeFirstOrThrow();
    enrolmentId = Number(enrolment.insertId);
    // …and into head office's Wallet.
    await recordCourseFee(trx, {
      enrolmentId,
      amount: opts.paid.amount,
      payMode: opts.paid.payMode ?? 'online',
      transactionNo: opts.paid.transactionNo ?? null,
      remark: `Course fee — ${course.name}. Paid online at registration (${registrationNo}).`,
    });
  }

  return { studentId, registrationNo, enrolmentId };
}
