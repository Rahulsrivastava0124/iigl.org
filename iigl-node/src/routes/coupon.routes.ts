import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';

/**
 * Discount coupons, for course enrolments.
 *
 * A coupon is a rule for taking money off a **course fee**, written before
 * anybody uses it and spent by presenting its code when a student enrols. That
 * is the only thing it does: there is no coupon on an order at a laboratory
 * counter and none on a laboratory's own bill, because neither of those fees
 * has anywhere to record one.
 *
 * It sits beside the discount already on `student_courses` rather than
 * replacing it:
 *
 *   the enrolment discount   a figure decided for one student, typed in with a
 *                            reason, recorded beside the fee it reduces
 *   a coupon                 a rule that exists first, is given out by its
 *                            code, and can be spent by many students
 *
 * Spending one **writes the enrolment discount** — same columns, same
 * `final_fee` arithmetic — and records the redemption. So there is still one
 * answer to "what does this student owe", and it is still on the enrolment.
 *
 * Head office only, like every other course route: the student pipeline is
 * theirs.
 */
export const couponRoutes = Router();
couponRoutes.use(requireAdmin);

const TYPES = ['percent', 'fixed'] as const;

const text = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim());

const requireText = (v: unknown, field: string): string => {
  const s = text(v);
  if (!s) throw badRequest(`${field} is required.`);
  return s;
};

/** A number that is a number, or the field named in the message. */
function amount(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw badRequest(`${field} must be a number, and not negative.`);
  return n;
}

/** An optional whole count. Null means no limit, which is not the same as 0. */
function limit(v: unknown, field: string): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw badRequest(`${field} must be a whole number above zero.`);
  return n;
}

const date = (v: unknown, field: string): string | null => {
  const s = text(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest(`${field} must be YYYY-MM-DD.`);
  return s;
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], field: string): T => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase() as T;
  if (!allowed.includes(s)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}.`);
  return s;
};

/** Today, as the `date` columns hold it. */
const today = () => new Date().toISOString().slice(0, 10);

/** The code as it is stored: upper case, no spaces. It is read off a printout. */
const codeOf = (v: unknown, field = 'Code') =>
  requireText(v, field).toUpperCase().replace(/\s+/g, '');

/**
 * What a coupon takes off a course fee.
 *
 * Whole rupees, capped three ways: by the coupon's own `max_discount`, by the
 * fee itself, and — for a percentage — by the arithmetic. The rounding matches
 * `discountOf()` in course.routes.ts on purpose: the same enrolment columns are
 * written either way, and two roundings would make the same coupon worth a
 * rupee more through one door than the other.
 */
export function couponDiscount(
  fee: number,
  coupon: { discount_type: string; discount_value: unknown; max_discount: unknown },
): number {
  const value = Number(coupon.discount_value ?? 0);
  if (value <= 0 || fee <= 0) return 0;

  const raw = coupon.discount_type === 'percent' ? (fee * value) / 100 : value;
  const cap = coupon.max_discount == null ? null : Number(coupon.max_discount);
  const capped = cap !== null && cap > 0 ? Math.min(raw, cap) : raw;

  return Math.min(fee, Math.round(capped));
}

type CouponRow = {
  id: number;
  code: string;
  discount_type: string;
  discount_value: unknown;
  max_discount: unknown;
  min_amount: unknown;
  course_id: number | null;
  valid_from: unknown;
  valid_to: unknown;
  usage_limit: number | null;
  per_student_limit: number | null;
  used_count: number;
  is_active: number;
};

type EnrolmentRow = {
  id: number;
  student_id: number | null;
  course_id: number | null;
  fee: unknown;
  fee_paid: unknown;
  discount_amount: unknown;
};

async function coupon(id: number) {
  const row = await db
    .selectFrom('discount_coupons')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) throw notFound('Coupon not found.');
  return row;
}

/** The enrolment a coupon is being spent on, with the fee it carries. */
async function enrolment(id: unknown) {
  const enrolmentId = Number(id);
  if (!Number.isInteger(enrolmentId) || enrolmentId < 1) {
    throw badRequest('Choose the enrolment the coupon is for.');
  }

  const row = await db
    .selectFrom('student_courses')
    .select(['id', 'student_id', 'course_id', 'fee', 'fee_paid', 'discount_amount'])
    .where('id', '=', enrolmentId)
    .executeTakeFirst();
  if (!row) throw notFound('Enrolment not found.');
  return row as EnrolmentRow;
}

/**
 * Why a coupon cannot be used on this enrolment, or null when it can.
 *
 * One function for both `/validate` and `/redeem`, so what the screen says and
 * what the redemption enforces cannot drift apart. Every refusal names the
 * reason: "not valid" sends somebody to the telephone, "expired on 2026-08-31"
 * does not.
 */
async function refusal(c: CouponRow, e: EnrolmentRow): Promise<string | null> {
  if (!c.is_active) return `${c.code} has been switched off.`;

  const from = c.valid_from ? String(c.valid_from).slice(0, 10) : null;
  const to = c.valid_to ? String(c.valid_to).slice(0, 10) : null;
  const now = today();
  if (from && now < from) return `${c.code} is not valid until ${from}.`;
  if (to && now > to) return `${c.code} expired on ${to}.`;

  // Same rule as a typed discount: the fee is settled once money has moved.
  if (Number(e.fee_paid) > 0) {
    return `A coupon can only be applied before the first payment, and ${Number(e.fee_paid)} has already been paid.`;
  }

  if (c.course_id !== null && Number(c.course_id) !== Number(e.course_id)) {
    const course = await db
      .selectFrom('courses')
      .select('name')
      .where('id', '=', Number(c.course_id))
      .executeTakeFirst();
    return `${c.code} is only for ${course?.name ?? 'another course'}.`;
  }

  const fee = Number(e.fee);
  const min = Number(c.min_amount ?? 0);
  if (min > 0 && fee < min) return `${c.code} needs a course fee of at least ${min}.`;

  if (c.usage_limit !== null && Number(c.used_count) >= Number(c.usage_limit)) {
    return `${c.code} has been used ${c.used_count} times and has run out.`;
  }

  if (c.per_student_limit !== null && e.student_id !== null) {
    const mine = await db
      .selectFrom('coupon_redemptions')
      .select(({ fn }) => fn.countAll().as('n'))
      .where('coupon_id', '=', Number(c.id))
      .where('student_id', '=', Number(e.student_id))
      .executeTakeFirstOrThrow();
    if (Number(mine.n) >= Number(c.per_student_limit)) {
      const times = Number(c.per_student_limit);
      return `${c.code} allows ${times} use${times === 1 ? '' : 's'} per student, and this student has used it.`;
    }
  }

  return null;
}

// ------------------------------------------------------------------ the list

couponRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req);
    const term = String(req.query.q ?? '').trim();

    const base = () => {
      let q = db.selectFrom('discount_coupons');
      if (req.query.course_id) q = q.where('course_id', '=', Number(req.query.course_id));
      if (req.query.active === '1') q = q.where('is_active', '=', 1);
      if (req.query.active === '0') q = q.where('is_active', '=', 0);
      if (term) {
        q = q.where((eb) =>
          eb.or([eb('code', 'like', `%${term}%`), eb('title', 'like', `%${term}%`)]),
        );
      }
      return q;
    };

    const [rows, count] = await Promise.all([
      base()
        .leftJoin('courses', 'courses.id', 'discount_coupons.course_id')
        .selectAll('discount_coupons')
        // Named here rather than looked up on the screen: a coupon tied to a
        // course is meaningless as an id.
        .select('courses.name as course_name')
        .orderBy('discount_coupons.is_active', 'desc')
        .orderBy('discount_coupons.id', 'desc')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      base().select(db.fn.countAll().as('n')).executeTakeFirstOrThrow(),
    ]);

    res.json(
      paged(
        rows.map((r) => ({
          ...r,
          is_active: Number(r.is_active),
          // Said here rather than worked out on three screens: a coupon that
          // has run out or run past its date is still `is_active = 1`, and a
          // list that does not say so invites somebody to promise it.
          spent: r.usage_limit !== null && Number(r.used_count) >= Number(r.usage_limit),
          expired: Boolean(r.valid_to && today() > String(r.valid_to).slice(0, 10)),
        })),
        Number(count.n),
        p,
      ),
    );
  }),
);

couponRoutes.post(
  '/',
  wrap(async (req, res) => {
    const code = codeOf(req.body?.code);
    const type = oneOf(req.body?.discount_type ?? 'percent', TYPES, 'discount_type');
    const value = amount(req.body?.discount_value, 'discount_value');
    if (value <= 0) throw badRequest('A coupon that takes off nothing is not a coupon.');
    if (type === 'percent' && value > 100) throw badRequest('A percentage cannot exceed 100.');

    const validFrom = date(req.body?.valid_from, 'valid_from');
    const validTo = date(req.body?.valid_to, 'valid_to');
    if (validFrom && validTo && validTo < validFrom) {
      throw badRequest('The last day cannot be before the first.');
    }

    const courseId = req.body?.course_id ? Number(req.body.course_id) : null;
    if (courseId !== null) {
      const course = await db
        .selectFrom('courses')
        .select('id')
        .where('id', '=', courseId)
        .executeTakeFirst();
      if (!course) throw badRequest('That course does not exist.');
    }

    const clash = await db
      .selectFrom('discount_coupons')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();
    if (clash) throw conflict(`${code} is already a coupon.`);

    const result = await db
      .insertInto('discount_coupons')
      .values({
        code,
        title: text(req.body?.title),
        description: text(req.body?.description),
        discount_type: type,
        discount_value: String(value),
        max_discount:
          req.body?.max_discount == null || req.body?.max_discount === ''
            ? null
            : String(amount(req.body.max_discount, 'max_discount')),
        min_amount: String(amount(req.body?.min_amount ?? 0, 'min_amount')),
        course_id: courseId,
        valid_from: validFrom ? new Date(`${validFrom}T00:00:00`) : null,
        valid_to: validTo ? new Date(`${validTo}T00:00:00`) : null,
        usage_limit: limit(req.body?.usage_limit, 'usage_limit'),
        per_student_limit: limit(req.body?.per_student_limit, 'per_student_limit'),
        used_count: 0,
        is_active: req.body?.is_active === undefined ? 1 : req.body.is_active ? 1 : 0,
        created_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();

    res.status(201).json({ data: { id: Number(result.insertId), code } });
  }),
);

couponRoutes.get(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    res.json({ data: await coupon(Number(req.params.id)) });
  }),
);

couponRoutes.patch(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const row = await coupon(Number(req.params.id));
    const patch: Record<string, unknown> = { updated_at: new Date() };

    if (req.body?.code !== undefined) {
      const code = codeOf(req.body.code);
      if (code !== row.code) {
        const clash = await db
          .selectFrom('discount_coupons')
          .select('id')
          .where('code', '=', code)
          .where('id', '!=', Number(row.id))
          .executeTakeFirst();
        if (clash) throw conflict(`${code} is already a coupon.`);
      }
      patch.code = code;
    }

    if (req.body?.title !== undefined) patch.title = text(req.body.title);
    if (req.body?.description !== undefined) patch.description = text(req.body.description);

    if (req.body?.discount_type !== undefined) {
      patch.discount_type = oneOf(req.body.discount_type, TYPES, 'discount_type');
    }
    if (req.body?.discount_value !== undefined) {
      const value = amount(req.body.discount_value, 'discount_value');
      if (value <= 0) throw badRequest('A coupon that takes off nothing is not a coupon.');
      const type = String(patch.discount_type ?? row.discount_type);
      if (type === 'percent' && value > 100) throw badRequest('A percentage cannot exceed 100.');
      patch.discount_value = String(value);
    }
    if (req.body?.max_discount !== undefined) {
      patch.max_discount =
        req.body.max_discount == null || req.body.max_discount === ''
          ? null
          : String(amount(req.body.max_discount, 'max_discount'));
    }
    if (req.body?.min_amount !== undefined) {
      patch.min_amount = String(amount(req.body.min_amount, 'min_amount'));
    }
    if (req.body?.course_id !== undefined) {
      patch.course_id = req.body.course_id ? Number(req.body.course_id) : null;
    }
    if (req.body?.usage_limit !== undefined) {
      patch.usage_limit = limit(req.body.usage_limit, 'usage_limit');
    }
    if (req.body?.per_student_limit !== undefined) {
      patch.per_student_limit = limit(req.body.per_student_limit, 'per_student_limit');
    }
    if (req.body?.valid_from !== undefined) {
      const from = date(req.body.valid_from, 'valid_from');
      patch.valid_from = from ? new Date(`${from}T00:00:00`) : null;
    }
    if (req.body?.valid_to !== undefined) {
      const to = date(req.body.valid_to, 'valid_to');
      patch.valid_to = to ? new Date(`${to}T00:00:00`) : null;
    }

    const from = (patch.valid_from ?? row.valid_from) as Date | null;
    const to = (patch.valid_to ?? row.valid_to) as Date | null;
    if (from && to && String(to).slice(0, 10) < String(from).slice(0, 10)) {
      throw badRequest('The last day cannot be before the first.');
    }

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db
      .updateTable('discount_coupons')
      .set(patch as never)
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ ok: true });
  }),
);

/**
 * Switch a coupon on or off.
 *
 * The way a coupon is withdrawn. Deleting one that has been spent would take
 * its redemptions with it — the record of money already taken off a student's
 * fee — so this is what the screen offers, and DELETE refuses a spent one.
 */
couponRoutes.patch(
  '/:id/active',
  numericId,
  wrap(async (req, res) => {
    const row = await coupon(Number(req.params.id));
    await db
      .updateTable('discount_coupons')
      .set({ is_active: req.body?.is_active ? 1 : 0, updated_at: new Date() })
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ ok: true });
  }),
);

couponRoutes.delete(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const row = await coupon(Number(req.params.id));

    const used = await db
      .selectFrom('coupon_redemptions')
      .select(({ fn }) => fn.countAll().as('n'))
      .where('coupon_id', '=', Number(row.id))
      .executeTakeFirstOrThrow();
    const times = Number(used.n);
    if (times > 0) {
      throw conflict(
        `${row.code} has been used ${times} time${times === 1 ? '' : 's'}. Switch it off instead — deleting it would take the record of those discounts with it.`,
      );
    }

    await db.deleteFrom('discount_coupons').where('id', '=', Number(row.id)).execute();
    res.json({ ok: true });
  }),
);

// -------------------------------------------------------- spending a coupon

async function byCode(code: string) {
  const row = await db
    .selectFrom('discount_coupons')
    .selectAll()
    .where('code', '=', code)
    .executeTakeFirst();
  if (!row) throw notFound(`${code} is not a coupon.`);
  return row;
}

/**
 * What a coupon would take off this enrolment, without spending it.
 *
 * For the screen applying it: type the code, see the figure before committing
 * to it. Changes nothing, and a coupon that cannot be used comes back as a
 * refusal with the reason rather than a zero.
 */
couponRoutes.post(
  '/validate',
  wrap(async (req, res) => {
    const c = await byCode(codeOf(req.body?.code));
    const e = await enrolment(req.body?.enrolment_id);

    const no = await refusal(c as CouponRow, e);
    if (no) throw badRequest(no);

    const fee = Number(e.fee);
    const discount = couponDiscount(fee, c);
    const finalFee = fee - discount;
    if (finalFee < Number(e.fee_paid)) {
      throw badRequest(`${c.code} would put the fee below the ${Number(e.fee_paid)} already paid.`);
    }

    res.json({
      data: {
        coupon_id: Number(c.id),
        code: c.code,
        title: c.title,
        discount_type: c.discount_type,
        discount_value: c.discount_value,
        fee,
        discount,
        final_fee: finalFee,
      },
    });
  }),
);

/**
 * Spend a coupon on an enrolment.
 *
 * Writes the enrolment's own discount columns — the same ones
 * `PATCH /api/courses/enrolments/{id}/discount` writes, with `final_fee`
 * computed here and never taken from the request — records the redemption, and
 * moves the coupon's count. One transaction: the check, the fee and the count
 * have to agree or none of them should happen.
 *
 * Everything /validate checks is checked again, because the two calls are
 * minutes apart and a coupon with one use left can be presented twice in that
 * gap.
 */
couponRoutes.post(
  '/redeem',
  wrap(async (req, res) => {
    const c = await byCode(codeOf(req.body?.code));
    const e = await enrolment(req.body?.enrolment_id);

    const result = await db.transaction().execute(async (trx) => {
      // Read both again inside the transaction: `used_count` and the fee may
      // have moved since the rows above were fetched.
      const fresh = await trx
        .selectFrom('discount_coupons')
        .selectAll()
        .where('id', '=', Number(c.id))
        .forUpdate()
        .executeTakeFirstOrThrow();

      const row = (await trx
        .selectFrom('student_courses')
        .select(['id', 'student_id', 'course_id', 'fee', 'fee_paid', 'discount_amount'])
        .where('id', '=', Number(e.id))
        .forUpdate()
        .executeTakeFirstOrThrow()) as EnrolmentRow;

      const no = await refusal(fresh as CouponRow, row);
      if (no) throw conflict(no);

      const fee = Number(row.fee);
      const discount = couponDiscount(fee, fresh);
      const finalFee = fee - discount;
      if (finalFee < Number(row.fee_paid)) {
        throw conflict(
          `${fresh.code} would put the fee below the ${Number(row.fee_paid)} already paid.`,
        );
      }

      await trx
        .updateTable('student_courses')
        .set({
          discount_type: fresh.discount_type,
          discount_value: String(Number(fresh.discount_value)),
          discount_amount: String(discount),
          // The reason is the coupon, written where a typed reason would go, so
          // the discount screen explains itself without joining anything.
          discount_reason: `Coupon ${fresh.code}`,
          discount_approved_by: req.user.id,
          discount_applied_on: new Date(),
          final_fee: String(finalFee),
          updated_at: new Date(),
        })
        .where('id', '=', Number(row.id))
        .execute();

      const redemption = await trx
        .insertInto('coupon_redemptions')
        .values({
          coupon_id: Number(fresh.id),
          code: fresh.code,
          enrolment_id: Number(row.id),
          student_id: row.student_id,
          course_id: row.course_id,
          fee: String(fee),
          discount: String(discount),
          final_fee: String(finalFee),
          redeemed_by: req.user.id,
          note: text(req.body?.note),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('discount_coupons')
        .set({ used_count: Number(fresh.used_count) + 1, updated_at: new Date() })
        .where('id', '=', Number(fresh.id))
        .execute();

      return { id: Number(redemption.insertId), fee, discount, final_fee: finalFee };
    });

    res.status(201).json({ data: { code: c.code, ...result } });
  }),
);

/** Where a coupon went: one enrolment per row, newest first. */
couponRoutes.get(
  '/:id/redemptions',
  numericId,
  wrap(async (req, res) => {
    const row = await coupon(Number(req.params.id));
    const p = readPage(req);

    const [rows, count] = await Promise.all([
      db
        .selectFrom('coupon_redemptions')
        .leftJoin('students', 'students.id', 'coupon_redemptions.student_id')
        .leftJoin('courses', 'courses.id', 'coupon_redemptions.course_id')
        .leftJoin('users as by', 'by.id', 'coupon_redemptions.redeemed_by')
        .select([
          'coupon_redemptions.id as id',
          'coupon_redemptions.code as code',
          'coupon_redemptions.enrolment_id as enrolment_id',
          'coupon_redemptions.fee as fee',
          'coupon_redemptions.discount as discount',
          'coupon_redemptions.final_fee as final_fee',
          'coupon_redemptions.note as note',
          'coupon_redemptions.created_at as created_at',
          'students.name as student_name',
          'students.registration_no as registration_no',
          'courses.name as course_name',
          'by.fullname as redeemed_by_name',
        ])
        .where('coupon_id', '=', Number(row.id))
        .orderBy('coupon_redemptions.id', 'desc')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      db
        .selectFrom('coupon_redemptions')
        .select(db.fn.countAll().as('n'))
        .where('coupon_id', '=', Number(row.id))
        .executeTakeFirstOrThrow(),
    ]);

    res.json(paged(rows, Number(count.n), p));
  }),
);
