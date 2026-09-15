import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import type { SessionUser } from '../lib/session.js';

/**
 * A database handle: the pool, or a transaction on it.
 *
 * `Transaction<DB>` is a `Kysely<DB>`, so a helper typed like this runs either
 * way. Creating an account and employing them is two writes with no foreign
 * key between them — an account whose employment failed is invisible to the
 * staff list and belongs to nobody, so the create route hands both a
 * transaction rather than leaving one behind.
 */
type Exec = Kysely<DB>;
import { wrap } from '../lib/async.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { accruedByLab, expenseWallets, TRANSACTION_TYPE } from '../services/commission.service.js';
import {
  franchiseAgreementHtml,
  franchiseAgreementPdf,
  franchiseeFormHtml,
  franchiseeFormPdf,
  payslipHtml,
  payslipPdf,
} from '../services/document.service.js';

/** Approved is 1; a pending row has not moved any money. */
const TX_STATUS = { PENDING: 0, APPROVED: 1 } as const;
import { paged, readPage, readSearch } from '../lib/paginate.js';
import {
  assertEmploys,
  requireAdmin,
  requireEmployer,
  requireLabScope,
  ROLE,
} from '../middleware/auth.js';
import { empidTaken, nextEmpid, prefixFor } from '../lib/empid.js';
import {
  ABILITIES,
  PERMISSION_SCOPE,
  appliesTo,
  can,
  effectivePermissionsFor,
  headOfficeOr,
  invalidatePermissions,
  isActionType,
  isHeadOffice,
  staffKindOf,
  staffKindOfUser,
  userPermissionsFor,
} from '../services/permission.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const userRoutes = Router();

/** Columns safe to return. Never selects password or remember_token. */
/**
 * A role this person may actually put somebody in.
 *
 * Roles are owned now: `owner_id` NULL is head office's, offered to everybody,
 * and anything else belongs to one laboratory. Nothing else checked that.
 * `POST /users` refuses a laboratory the two senior roles and let any other
 * number through — so a laboratory could hire an employee into laboratory
 * twelve's "Front desk" and inherit twelve's permission matrix, simply by
 * posting its id. The panel never offers it; that is not the same as it being
 * refused.
 *
 * `null` is a real answer — no role, permissions granted one by one — and is
 * allowed through.
 */
async function assertRoleAssignable(user: Express.Request['user'], roleId: number | null) {
  if (roleId === null) return;

  const role = await db
    .selectFrom('roles')
    .select(['id', 'role_name', 'owner_id'])
    .where('id', '=', roleId)
    .executeTakeFirst();
  if (!role) throw badRequest('That role does not exist.');

  if (user.roleId === ROLE.SUPER) return;
  if (role.owner_id === null) return;

  const mine = Number(user.labId ?? user.id);
  if (Number(role.owner_id) !== mine) {
    throw forbidden(`${role.role_name} belongs to another laboratory.`);
  }
}

/**
 * Head office or a laboratory — the two roles nobody below them may act on.
 *
 * Written as a set rather than `<= 2`: custom roles can hold any number above
 * team, so an inequality would quietly admit the next one somebody creates.
 */
const isSenior = (roleId: unknown) =>
  roleId !== null && (Number(roleId) === ROLE.SUPER || Number(roleId) === ROLE.LAB);

const PUBLIC_COLUMNS = [
  'id',
  'empid',
  'fullname',
  'owner_name',
  'mobile',
  'alt_mobile',
  // The office landline, with its STD code. Not the alternate mobile: the
  // printed franchisee form asks for both, in two different boxes.
  'office_tel',
  // The address the account signs in with, and where a password reset goes —
  // a person's mailbox. `official_email` beside it is the franchise's own, the
  // one printed on paper and read by whoever is at the office.
  'email',
  'official_email',
  'address',
  'city',
  'state',
  'country',
  'pincode',
  'gst_no',
  // The bank and identity columns were editable but not readable: every one of
  // these is on SELF_EDITABLE, so a screen could write them and then show the
  // field empty on the next load. Reading back what you just saved is the
  // least a form owes anybody.
  'bank_name',
  'account_holder',
  'bank_branch',
  'ifsc_code',
  'account_no',
  'account_type',
  // Laravel's spelling, kept: `adhar_*` and `pan_*` are the live column names.
  'adhar_no',
  'adhar_photo',
  'pan_no',
  'pan_photo',
  'passport_no',
  'passport_photo',
  'dl_no',
  'dl_photo',
  'voter_id',
  'voter_photo',
  // The documents produced as proof, comma separated — "PAN,AADHAR". Two
  // questions with two different lists, as the paper asks them: a PAN card is
  // identity proof and is not address proof, and which document proves the
  // address is the franchisee's answer to give. A card named in both is still
  // one card — its number and its scan are kept once.
  'id_proof_type',
  'address_proof_type',
  // The attachment list, as JSON. The driver hands it back parsed.
  'documents',
  'fax',
  'documentation',
  'profile_photo',
  'company_logo',
  'signature',
  'commision',
  'commission_type',
  'registration_fee',
  // Head office's billing terms, read back by the form that sets them.
  'statement_period',
  'statement_grace_days',
  'statement_from',
  'is_active',
  'status',
  'role_id',
  'created_at',
] as const;

/**
 * The posting somebody currently holds, with their employer named.
 *
 * Who somebody works for, since when and for how much is half of what an
 * employee record is, and it lives in another table — so both the account
 * endpoints carry it rather than making a screen fetch the staff list and look
 * for one person in it.
 *
 * Null when nobody employs them: a laboratory, head office, or somebody whose
 * employment was ended.
 */
async function currentEmployment(userId: number) {
  const row = await db
    .selectFrom('employements')
    // Left, so an employment naming an empid no account holds still returns
    // the joining date and the salary rather than disappearing.
    .leftJoin('users as employer', 'employer.empid', 'employements.parent_id')
    .select([
      'employements.id as id',
      'employements.parent_id as lab_empid',
      'employements.joining_date as joining_date',
      'employements.salary as salary',
      'employements.week_off as week_off',
      'employements.working_hours as working_hours',
      'employements.late_after as late_after',
      'employements.shift_start as shift_start',
      'employements.shift_end as shift_end',
      'employer.id as lab_id',
      'employer.fullname as lab_name',
      'employer.mobile as lab_mobile',
      'employer.role_id as employer_role_id',
    ])
    .where('employements.user_id', '=', userId)
    .where('employements.is_working', '=', '1')
    .executeTakeFirst();

  return row ?? null;
}

userRoutes.get(
  '/me',
  requireLabScope,
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('users')
      .select(PUBLIC_COLUMNS)
      .where('id', '=', req.user.id)
      .executeTakeFirstOrThrow();

    // Their own posting comes with it: an employee's profile says who they
    // work under and what they are paid, and neither is on the users row.
    res.json({ data: { ...row, employment: await currentEmployment(req.user.id) } });
  }),
);

/** Laboratories. Head office sees all; a laboratory sees only itself. */
userRoutes.get(
  '/laboratories',
  requireLabScope,
  wrap(async (req, res) => {
    let q = db.selectFrom('users').select(PUBLIC_COLUMNS).where('role_id', '=', ROLE.LAB);
    // Head office sees every laboratory, and so does one of its employees who
    // holds Laboratories → View. A laboratory, and its staff, see their own.
    const network =
      req.user.roleId === ROLE.SUPER ||
      ((await isHeadOffice(req.user)) && (await can(req.user, 'laboratory', 'view')));
    if (!network) q = q.where('id', '=', req.user.labId);
    const rows = await q.orderBy('fullname').execute();

    // How many people work under each. `employements.parent_id` is the answer
    // to "which staff work under which laboratory", and a laboratory list that
    // cannot say how many is a list of names. It holds the employer's `empid`,
    // so the count is keyed by empid and read back with the laboratory's own.
    const counts = await db
      .selectFrom('employements')
      .select(({ fn }) => ['parent_id', fn.countAll().as('n')])
      .where('is_working', '=', '1')
      .groupBy('parent_id')
      .execute();
    const staff = new Map(counts.map((c) => [String(c.parent_id), Number(c.n)]));

    /*
      What each laboratory has earned and what has been settled.

      The same three figures the dashboard reports, per laboratory rather than
      for one account, and read the same way so the two cannot disagree:

        accrued  the laboratory's rate against the orders it has delivered or
                 taken money on — a percentage of what it actually collected,
                 or a flat amount per piece, depending on its terms
        paid     commission rows that have been approved
        due      the difference, floored at zero, because an overpayment is a
                 wallet balance and not a debt

      Two grouped queries rather than a query per laboratory: this list is the
      screen head office opens first, and a network of forty would otherwise be
      eighty round trips.
    */
    const [accruedBy, settled] = await Promise.all([
      accruedByLab(),
      db
        .selectFrom('transactions')
        .select(({ fn }) => ['send_by', fn.sum<number>('amount').as('total')])
        .where('transaction_type', '=', TRANSACTION_TYPE.COMMISSION)
        .where('status', '=', TX_STATUS.APPROVED)
        .groupBy('send_by')
        .execute(),
    ]);

    const round2 = (v: number) => Math.round(v * 100) / 100;
    const paidBy = new Map(settled.map((r) => [Number(r.send_by), Number(r.total ?? 0)]));

    res.json({
      data: rows.map((r) => {
        const accrued = accruedBy.get(Number(r.id)) ?? 0;
        const paid = round2(paidBy.get(Number(r.id)) ?? 0);
        return {
          ...r,
          staff: (r.empid && staff.get(r.empid)) || 0,
          commission_accrued: accrued,
          commission_paid: paid,
          commission_due: Math.max(0, round2(accrued - paid)),
        };
      }),
    });
  }),
);

/**
 * One laboratory, with what the screen behind its View button needs: its
 * payment history, its staff, and its certificates.
 *
 * Three lists in one reply rather than three endpoints, because the screen
 * opens all three tabs at once and the alternative is three round trips to
 * fill a dialog somebody may close immediately.
 *
 * Each list is capped rather than paged. This is a laboratory's recent
 * activity at a glance; the full history has screens of its own — Account for
 * transactions, Employee Management for staff, Certificates for reports — and
 * a dialog that pages is a screen pretending to be a dialog.
 */
userRoutes.get(
  '/laboratories/:id/detail',
  numericId,
  headOfficeOr('laboratory', 'view'),
  wrap(async (req, res) => {
    const labId = Number(req.params.id);
    const RECENT = 50;

    const lab = await db
      .selectFrom('users')
      .select([
        'id',
        'fullname',
        'owner_name',
        'empid',
        'mobile',
        'city',
        'commision',
        // The rate alone does not say whether it is a percentage or rupees a
        // piece, and a list that prints "15%" against a per-piece franchise is
        // stating terms nobody agreed.
        'commission_type',
        'is_active',
      ])
      .where('id', '=', labId)
      .where('role_id', '=', ROLE.LAB)
      .executeTakeFirst();
    if (!lab) throw notFound('Laboratory not found.');

    /*
      The same three figures the list carries, computed the same way.

      Repeated here rather than passed in from the row somebody clicked,
      because this is a page of its own: opened from a bookmark or a typed
      address there is no row, and a screen that only works when you arrive by
      one route is a screen that breaks the first time somebody reloads it.
    */
    const [earned, approved] = await Promise.all([
      accruedByLab(labId),
      db
        .selectFrom('transactions')
        .select(({ fn }) => fn.sum<number>('amount').as('total'))
        .where('send_by', '=', labId)
        .where('transaction_type', '=', TRANSACTION_TYPE.COMMISSION)
        .where('status', '=', TX_STATUS.APPROVED)
        .executeTakeFirstOrThrow(),
    ]);
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const accrued = earned.get(labId) ?? 0;
    const paid = round2(Number(approved.total ?? 0));

    const [payments, staffRows, reportRows, counts] = await Promise.all([
      // Commission this laboratory has sent, newest first. Both sides of the
      // wallet would be a ledger; this tab is about what has been settled.
      db
        .selectFrom('transactions')
        .select([
          'id',
          'amount',
          'status',
          'pay_mode',
          'transaction_no',
          'transaction_type',
          'remark',
          'created_at',
        ])
        .where('send_by', '=', labId)
        .orderBy('id', 'desc')
        .limit(RECENT)
        .execute(),

      // Who works there. `employements.parent_id` holds the employer's empid,
      // not their id, which is why this joins on the code rather than the key.
      lab.empid
        ? db
            .selectFrom('employements')
            .innerJoin('users', 'users.id', 'employements.user_id')
            .select([
              'users.id',
              'users.fullname',
              'users.mobile',
              'users.empid',
              'users.is_active',
              'employements.joining_date',
              'employements.salary',
            ])
            .where('employements.parent_id', '=', lab.empid)
            .where('employements.is_working', '=', '1')
            .orderBy('users.fullname')
            .execute()
        : Promise.resolve([]),

      db
        .selectFrom('reports')
        // item_image so the tab can show what was certified, hidden_on_site so
        // it can say which of these the public site will not answer for.
        .select([
          'id',
          'report_no',
          'carat_weight',
          'gross_weight',
          'created_at',
          'item_image',
          'hidden_on_site',
        ])
        .where('lab_id', '=', labId)
        .orderBy('id', 'desc')
        .limit(RECENT)
        .execute(),

      // The totals, which are not the length of the capped lists above.
      Promise.all([
        db
          .selectFrom('transactions')
          .select(({ fn }) => fn.countAll<number>().as('n'))
          .where('send_by', '=', labId)
          .executeTakeFirstOrThrow(),
        db
          .selectFrom('reports')
          .select(({ fn }) => fn.countAll<number>().as('n'))
          .where('lab_id', '=', labId)
          .executeTakeFirstOrThrow(),
      ]),
    ]);

    res.json({
      data: {
        laboratory: {
          ...lab,
          commission_accrued: accrued,
          commission_paid: paid,
          commission_due: Math.max(0, round2(accrued - paid)),
        },
        payments,
        staff: staffRows,
        reports: reportRows,
        counts: {
          payments: Number(counts[0].n),
          staff: staffRows.length,
          reports: Number(counts[1].n),
        },
        /** How many of each the lists above actually hold. */
        shown: RECENT,
      },
    });
  }),
);

/**
 * The Franchisee Form for one laboratory, filled from its record.
 *
 * The paper form head office hands a new franchisee, typeset and pre-filled:
 * name, owner, contact, address, GST, commission and bank details come from
 * the account, and everything decided at the counter — the KYC ticks, the
 * branch, the fee, the sponsor and the whole acknowledgement stub — is left
 * blank to be written in.
 *
 * `?format=html` returns the markup the PDF is rendered from, which is how the
 * layout is worked on without a render round trip, and is what the panel opens
 * in a tab so somebody can print it with the browser they already have.
 *
 * `?blank=1` prints the empty form — every label and box, no values. It is the
 * same template, so the sheet handed over at a counter and the sheet printed
 * back from the account cannot drift apart.
 */
/**
 * The Franchise Agreement: the four pages that follow the registration form.
 *
 * Same shape as the form above — a PDF inline, `?format=html` for the markup,
 * `?blank=1` for an empty one to hand across a counter.
 */
userRoutes.get(
  '/laboratories/:id/agreement',
  numericId,
  headOfficeOr('laboratory', 'view'),
  wrap(async (req, res) => {
    const labId = Number(req.params.id);

    const lab = await db
      .selectFrom('users')
      .select(['id', 'empid'])
      .where('id', '=', labId)
      .where('role_id', '=', ROLE.LAB)
      .executeTakeFirst();
    if (!lab) throw notFound('Laboratory not found.');

    const blank = req.query.blank === '1' || req.query.blank === 'true';

    if (req.query.format === 'html') {
      res.type('html').send(await franchiseAgreementHtml(labId, { blank }));
      return;
    }

    const pdf = await franchiseAgreementPdf(labId, { blank });
    res.type('application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="franchise-agreement-${blank ? 'blank' : (lab.empid ?? labId)}.pdf"`,
    );
    res.send(pdf);
  }),
);

userRoutes.get(
  '/laboratories/:id/registration',
  numericId,
  headOfficeOr('laboratory', 'view'),
  wrap(async (req, res) => {
    const labId = Number(req.params.id);

    const lab = await db
      .selectFrom('users')
      .select(['id', 'empid'])
      .where('id', '=', labId)
      .where('role_id', '=', ROLE.LAB)
      .executeTakeFirst();
    if (!lab) throw notFound('Laboratory not found.');

    const blank = req.query.blank === '1' || req.query.blank === 'true';

    if (req.query.format === 'html') {
      res.type('html').send(await franchiseeFormHtml(labId, { blank }));
      return;
    }

    const pdf = await franchiseeFormPdf(labId, { blank });
    res.type('application/pdf');
    // Inline: this is opened to be read and printed, not filed. A download
    // disposition would put it in a folder somebody then has to find.
    res.setHeader(
      'Content-Disposition',
      `inline; filename="franchisee-form-${blank ? 'blank' : (lab.empid ?? labId)}.pdf"`,
    );
    res.send(pdf);
  }),
);

/** Staff of a lab, joined through employements. */
/**
 * What each employee is owed for a month, and what the month says they worked.
 *
 * There is no payroll in this schema — no payslip, no payment, no deduction —
 * and this does not invent one. It puts two facts the panel already holds side
 * by side: the salary agreed on the employment, and the days their attendance
 * records for the month asked for.
 *
 * The pro-rata figure is **arithmetic, not a payslip**: the monthly salary
 * divided by the days in the month, times the days present. Whether a Sunday
 * counts, whether a half day is half, what an absence costs — none of that is
 * recorded anywhere, so none of it is assumed here. The screen says the rule it
 * used, and the figures it used it on, and stops.
 *
 * Scoped exactly as the staff list is: a laboratory sees its own people, head
 * office sees its own, or one laboratory's with `lab_id`.
 */
/**
 * Whose employees a staff list is about.
 *
 * Head office asked for `/users/staff` and was handed **the whole network** —
 * its own people and every laboratory's, mixed into one list. The employee
 * screen worked around that by filtering the rows it had already been sent,
 * which fixed the look of that one page and nothing else: the salary screen
 * beside it had no such filter and listed other laboratories' staff, and the
 * filtered page still paged and counted over rows it then threw away.
 *
 * So the question is answered once, here:
 *
 *   `lab_id`         head office looking at one laboratory's people, by name.
 *   head office      its own — employed by a head-office account, which is
 *                    what `employer.role_id` says. A laboratory's staff belong
 *                    on that laboratory's page.
 *   a laboratory     its own, as before.
 *   anybody else     nobody. A session whose employer does not resolve used to
 *                    fall through every filter and see every employee in the
 *                    system; belonging to nobody is not a licence to read
 *                    everybody.
 */
function scopeStaff<Q extends { where: any }>(q: Q, user: SessionUser, labIdParam: unknown): Q {
  if (user.roleId === ROLE.SUPER) {
    const asked = Number(labIdParam) || null;
    return asked
      ? (q.where('employer.id', '=', asked) as Q)
      : (q.where('employer.role_id', '=', ROLE.SUPER) as Q);
  }
  // Nobody, said plainly.
  if (user.labId === null) return q.where(sql`1 = 0`) as Q;
  return q.where('employer.id', '=', user.labId) as Q;
}

userRoutes.get(
  '/staff/salary',
  requireLabScope,
  wrap(async (req, res) => {
    const month = String(req.query.month ?? '').trim() || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw badRequest('The month must be YYYY-MM.');
    }

    const [year, mm] = month.split('-').map(Number);
    const from = `${month}-01`;
    const daysInMonth = new Date(year, mm, 0).getDate();
    const to = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    const labId = req.user.roleId === ROLE.SUPER ? Number(req.query.lab_id) || null : req.user.labId;

    const staffQuery = scopeStaff(
      db
        .selectFrom('employements')
        .innerJoin('users', 'users.id', 'employements.user_id')
        .leftJoin('users as employer', 'employer.empid', 'employements.parent_id')
        .where('employements.is_working', '=', '1')
        .select([
          'users.id as id',
          'users.empid as empid',
          'users.fullname as fullname',
          'users.role_id as role_id',
          'employements.salary as salary',
          'employements.joining_date as joining_date',
          'employer.fullname as lab_name',
        ]),
      req.user,
      req.query.lab_id,
    );

    const staff = await staffQuery.orderBy('users.fullname').execute();
    if (staff.length === 0) {
      res.json({ data: [], month, days_in_month: daysInMonth });
      return;
    }

    /*
      The month's attendance for all of them at once.

      `clockOut` is NOT NULL with a `00:00:00` seed meaning "still working", so
      an open day counts as present and contributes no minutes — the same
      reading the calendar and the tiles use.
    */
    const worked = await db
      .selectFrom('attendances')
      .select(({ fn }) => [
        'empId',
        fn.count('id').as('days'),
        sql<number>`SUM(CASE WHEN clockOut <> '00:00:00' AND clockOut > clockIn
                             THEN TIME_TO_SEC(clockOut) - TIME_TO_SEC(clockIn) ELSE 0 END)`.as(
          'seconds',
        ),
      ])
      .where(
        'empId',
        'in',
        staff.map((p) => Number(p.id)),
      )
      .where('date', '>=', new Date(`${from}T00:00:00`))
      .where('date', '<=', new Date(`${to}T00:00:00`))
      .groupBy('empId')
      .execute();

    /*
      The days the office was shut.

      A holiday is not an absence, so it cannot be left to read as one: a month
      with two national holidays would otherwise pay two days short for
      everybody who was told not to come in.

      Both lists count — head office's, which applies to everybody, and this
      laboratory's own — and they are counted as *distinct dates*, so a local
      holiday falling on a national one is one day off rather than two.
    */
    const holidayRows = await db
      .selectFrom('holidays')
      .select('date')
      .where('status', '<>', 0)
      .where('date', '>=', new Date(`${from}T00:00:00`))
      .where('date', '<=', new Date(`${to}T00:00:00`))
      // 0 is head office's list, which applies to everybody. See migration 035.
      .where('lab_id', 'in', labId === null ? [0] : [0, labId])
      .execute();
    const holidays = new Set(holidayRows.map((h) => String(h.date).slice(0, 10)));

    /* What has actually been paid against this month, per person. */
    const paidRows = await db
      .selectFrom('salary_payments')
      .select(({ fn }) => ['emp_id', fn.sum<number>('amount').as('paid')])
      .where('month', '=', month)
      .where(
        'emp_id',
        'in',
        staff.map((p) => Number(p.id)),
      )
      .groupBy('emp_id')
      .execute();

    /*
      Which holidays somebody was *not* already at work on. Attendance wins: a
      person who came in on a holiday is present that day, and counting the day
      twice would pay them for thirty-two days in a thirty-one day month.
    */
    const attendedOn = new Map<number, Set<string>>();
    for (const d of await db
      .selectFrom('attendances')
      .select(['empId', 'date'])
      .where('empId', 'in', staff.map((p) => Number(p.id)))
      .where('date', '>=', new Date(`${from}T00:00:00`))
      .where('date', '<=', new Date(`${to}T00:00:00`))
      .execute()) {
      const held = attendedOn.get(Number(d.empId));
      const key = String(d.date).slice(0, 10);
      if (held) held.add(key);
      else attendedOn.set(Number(d.empId), new Set([key]));
    }

    const byEmp = new Map(worked.map((w) => [Number(w.empId), w]));
    const paidBy = new Map(paidRows.map((r) => [Number(r.emp_id), Number(r.paid) || 0]));
    const round2 = (n: number) => Math.round(n * 100) / 100;

    res.json({
      data: staff.map((p) => {
        const row = byEmp.get(Number(p.id));
        const present = Number(row?.days ?? 0);
        const salary = Number(p.salary ?? 0);
        const paid = round2(paidBy.get(Number(p.id)) ?? 0);

        const attended = attendedOn.get(Number(p.id)) ?? new Set<string>();
        const off = [...holidays].filter((d) => !attended.has(d)).length;
        // Never more than the month has, whatever the two lists say.
        const counted = Math.min(daysInMonth, present + off);

        return {
          ...p,
          salary,
          days_present: present,
          // The days the office was shut and they were not in anyway. Counted
          // as worked, and returned separately so the screen can say why the
          // figure is more than the days attended.
          holidays: off,
          minutes_worked: Math.round(Number(row?.seconds ?? 0) / 60),
          // The rule, applied. Zero salary stays zero rather than becoming a
          // figure nobody agreed. It is what the Pay dialog opens on, not a
          // figure the list states as owed.
          payable: salary > 0 ? round2((salary / daysInMonth) * counted) : 0,
          paid,
        };
      }),
      month,
      days_in_month: daysInMonth,
    });
  }),
);

/**
 * Record a salary payment.
 *
 * The employer's, like everything else that writes about their staff: a person
 * paying their own salary is a person writing their own receipt.
 *
 * One row per payment rather than per month. A month is often paid in parts,
 * and a record that assumed one payment would have to be overwritten to hold
 * the second — which is how a part payment quietly becomes the only payment.
 *
 * The agreed salary and the days attended are copied onto the row as they stand
 * now. Attendance can be corrected afterwards, and a payslip that changes when
 * somebody edits a punch is not a receipt.
 */
userRoutes.post(
  '/staff/salary/pay',
  requireEmployer,
  wrap(async (req, res) => {
    const empId = Number(req.body?.emp_id);
    if (!Number.isInteger(empId) || empId <= 0) throw badRequest('Which employee?');
    await assertEmploys(req.user, empId);

    const month = String(req.body?.month ?? '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw badRequest('The month must be YYYY-MM.');

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Enter an amount above zero.');

    const paidOn = String(req.body?.paid_on ?? '').trim() || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw badRequest('The payment date must be YYYY-MM-DD.');

    // What the figures were at the moment of paying.
    const employment = await db
      .selectFrom('employements')
      .select('salary')
      .where('user_id', '=', empId)
      .where('is_working', '=', '1')
      .executeTakeFirst();

    const [year, mm] = month.split('-').map(Number);
    const daysInMonth = new Date(year, mm, 0).getDate();
    const present = await db
      .selectFrom('attendances')
      .select(({ fn }) => fn.count('id').as('n'))
      .where('empId', '=', empId)
      .where('date', '>=', new Date(`${month}-01T00:00:00`))
      .where('date', '<=', new Date(`${month}-${String(daysInMonth).padStart(2, '0')}T00:00:00`))
      .executeTakeFirstOrThrow();

    const result = await db
      .insertInto('salary_payments')
      .values({
        emp_id: empId,
        paid_by: req.user.id,
        month,
        amount: String(Math.round(amount * 100) / 100),
        paid_on: new Date(`${paidOn}T00:00:00`),
        pay_mode: String(req.body?.pay_mode ?? 'cash'),
        reference: req.body?.reference ? String(req.body.reference).trim() : null,
        note: req.body?.note ? String(req.body.note).trim() : null,
        salary_month: employment?.salary ? String(employment.salary) : null,
        days_present: Number(present.n) || 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId), month, amount } });
  }),
);

/**
 * What has been paid, and to whom.
 *
 * `emp_id` narrows it to one person — their own page asks that way — and
 * `month` to one month. Without either it is everything this employer has paid,
 * newest first, which is the history screen.
 */
userRoutes.get(
  '/staff/salary/payments',
  requireLabScope,
  wrap(async (req, res) => {
    const p = readPage(req, 50, 200);

    let q = db
      .selectFrom('salary_payments')
      .leftJoin('users as employee', 'employee.id', 'salary_payments.emp_id')
      .leftJoin('users as payer', 'payer.id', 'salary_payments.paid_by')
      .select([
        'salary_payments.id as id',
        'salary_payments.emp_id as emp_id',
        'salary_payments.month as month',
        'salary_payments.amount as amount',
        'salary_payments.paid_on as paid_on',
        'salary_payments.pay_mode as pay_mode',
        'salary_payments.reference as reference',
        'salary_payments.note as note',
        'salary_payments.days_present as days_present',
        'salary_payments.salary_month as salary_month',
        'employee.fullname as employee_name',
        'employee.empid as employee_empid',
        'payer.fullname as paid_by_name',
      ]);

    if (req.query.emp_id) {
      const empId = Number(req.query.emp_id);
      // Their own, or one of yours. Anybody else's payroll is not yours to see.
      if (empId !== req.user.id) await assertEmploys(req.user, empId);
      q = q.where('salary_payments.emp_id', '=', empId);
    } else if (req.user.roleId !== ROLE.SUPER) {
      // Everything this employer has paid.
      q = q.where('salary_payments.paid_by', '=', req.user.id);
    }

    if (req.query.month) q = q.where('salary_payments.month', '=', String(req.query.month));

    const rows = await q
      .orderBy('salary_payments.id', 'desc')
      .limit(p.limit)
      .offset(p.offset)
      .execute();

    res.json(paged(rows, rows.length + p.offset, p));
  }),
);

/**
 * The payslip, as a PDF. `?format=html` for the markup, as the other documents.
 *
 * The employer's, or their own: a person may have their own payslip, and only
 * their employer may read anybody else's.
 */
userRoutes.get(
  '/staff/:id/payslip',
  numericId,
  requireLabScope,
  wrap(async (req, res) => {
    const empId = Number(req.params.id);
    if (empId !== req.user.id) await assertEmploys(req.user, empId);

    const month = String(req.query.month ?? '').trim() || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw badRequest('The month must be YYYY-MM.');

    if (req.query.format === 'html') {
      res.type('html').send(await payslipHtml(empId, month));
      return;
    }

    const pdf = await payslipPdf(empId, month);
    res.type('application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="payslip-${empId}-${month}.pdf"`);
    res.send(pdf);
  }),
);

userRoutes.get(
  '/staff',
  requireLabScope,
  wrap(async (req, res) => {
    const p = readPage(req);

    // Qualified column names: the join puts a `mobile` on both sides.
    const search = readSearch(req, ['users.fullname', 'users.mobile', 'users.email']);

    const base = () => {
      let q = scopeStaff(
        db
          .selectFrom('employements')
          .innerJoin('users', 'users.id', 'employements.user_id')
          // Who they work for. `employements.parent_id` is an `empid` — a
          // laboratory's, or head office's — so the employer's name comes from
          // the same table as the employee's, joined on that instead of on the
          // primary key. Left, so a parent that resolves to nobody still shows
          // the employee rather than hiding them.
          .leftJoin('users as employer', 'employer.empid', 'employements.parent_id')
          .where('employements.is_working', '=', '1'),
        // Scoped on the employer's id rather than their empid: the session is
        // keyed by user id, like the rest of the API.
        req.user,
        req.query.lab_id,
      );
      if (search) q = q.where(search);
      return q;
    };

    // Counted separately: passing the page length as the total made
    // total_pages always 1, so a client could never page past the first screen.
    const [rows, count] = await Promise.all([
      base()
        .select([
          'users.id as id',
          // Their own employee ID, not their employer's: the panel shows it,
          // and it is what an employment would name them by if they ever
          // employ anybody themselves.
          'users.empid as empid',
          'users.fullname as fullname',
          'users.mobile as mobile',
          'users.role_id as role_id',
          'users.is_active as is_active',
          // With the joining date, where an absence can start from: a joining
          // date is sometimes typed later than somebody's first punch.
          'users.created_at as created_at',
          // The list shows a face beside each name; without this column every
          // row fell back to initials.
          'users.profile_photo as profile_photo',
          // `lab_empid` is what the employment actually stores; `lab_id` is
          // that employer's user id, resolved here because every other id in
          // this API is a user id and the panel moves an employment by one.
          'employements.parent_id as lab_empid',
          'employer.id as lab_id',
          // Returned rather than looked up client-side: a laboratory cannot
          // read the laboratory list, and head office as an employer is not on
          // it at all, so the panel had no way to name either.
          'employer.fullname as lab_name',
          'employer.role_id as employer_role_id',
          'employements.joining_date as joining_date',
          'employements.salary as salary',
          'employements.week_off as week_off',
          'employements.working_hours as working_hours',
          'employements.late_after as late_after',
          'employements.shift_start as shift_start',
          'employements.shift_end as shift_end',
          'employements.is_working as is_working',
        ])
        .orderBy('users.fullname')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      base().select(db.fn.countAll().as('n')).executeTakeFirstOrThrow(),
    ]);

    /*
      Where each of them is today: at work, on leave, or not punched in.

      Two grouped queries over the page's own ids rather than a column on the
      join — attendance is one row per person per day and a message is many, so
      either as a join would multiply the page out. Read here rather than from
      a second endpoint because the list is already the thing being drawn and a
      badge that arrives a moment later is a badge that flickers.

      **Leave beats attendance.** Somebody who asked for the day off and then
      came in anyway is at work, and the green says so; the ordering below puts
      attendance first for exactly that reason.
    */
    const ids = rows.map((r) => Number(r.id));
    const [punched, onLeave] = ids.length
      ? await Promise.all([
          db
            .selectFrom('attendances')
            .select('empId')
            .where('empId', 'in', ids)
            .where('date', '=', new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`))
            .execute(),
          db
            .selectFrom('staff_messages')
            .select('from_user')
            .where('from_user', 'in', ids)
            .where('topic', '=', 'leave')
            .where(
              'about_date',
              '=',
              new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`),
            )
            .execute(),
        ])
      : [[], []];

    // Punched in at all — still working or gone home, both are present. What
    // the badge answers is whether somebody turned up.
    const present = new Set(punched.map((a) => Number(a.empId)));
    const leave = new Set(onLeave.map((m) => Number(m.from_user)));

    /*
      Each employee's expense float, so their employer can see at a glance who
      is running low and who is owed money out of their own pocket. One grouped
      read over the page, for the same reason attendance is.
    */
    const floats = await expenseWallets(ids);

    res.json(
      paged(
        rows.map((r) => ({
          ...r,
          expense_wallet: floats.get(Number(r.id)) ?? null,
          today: present.has(Number(r.id))
            ? 'present'
            : leave.has(Number(r.id))
              ? 'leave'
              : 'absent',
        })),
        Number(count.n),
        p,
      ),
    );
  }),
);

/*
 * The role list used to live here. It moved to /api/roles, which is a router of
 * its own now that a laboratory can create roles and both kinds of owner need
 * scoping — see role.routes.ts.
 */

/** Creating accounts is administrator-only. */
userRoutes.post(
  '/',
  requireEmployer,
  wrap(async (req, res) => {
    const { fullname, mobile, password, role_id, email } = req.body ?? {};
    const employerIsLab = req.user.roleId === ROLE.LAB;

    // A laboratory hires staff and nothing else. Head office is the only
    // account that can create another laboratory or another head office, and
    // this is the check that keeps it that way — without it a laboratory could
    // post `role_id: 2` and mint itself a franchise.
    if (employerIsLab && isSenior(role_id)) {
      throw forbidden('A laboratory can create staff accounts only.');
    }
    // role_id 0 is "no role": this person's permissions are their own, granted
    // one by one. It is a real choice rather than a missing field, so it is
    // checked against undefined rather than for truthiness.
    // A role is required as a *decision*: `null` means "no role, permissions
    // granted individually", and is different from the field being absent.
    if (!fullname || !mobile || !password || role_id === undefined) {
      throw badRequest('Name, mobile, password and role are required.');
    }
    if (String(password).length < 8) throw badRequest('Password must be at least 8 characters.');

    const clash = await db
      .selectFrom('users')
      .select('id')
      .where('mobile', '=', String(mobile))
      .executeTakeFirst();
    if (clash) throw conflict('An account with that mobile number already exists.');

    const role = role_id === null || role_id === '' ? null : Number(role_id);
    await assertRoleAssignable(req.user, role);

    // An empid or the account is half-made. `employements.parent_id` and
    // `users.parent_id` name an employer by empid, so an account without one
    // can neither employ anybody nor be found by the staff list, which joins
    // through those columns. One may be given; otherwise the next free one for
    // the account's kind is taken.
    const given = req.body?.empid ? String(req.body.empid).trim() : '';
    if (given && (await empidTaken(given))) {
      throw conflict(`Another account already uses the employee ID ${given}.`);
    }
    const prefix = prefixFor(role);
    const empid = given || (await nextEmpid(prefix));

    const hashed = await bcrypt.hash(String(password), 10);

    /*
     * The account and its employment, or neither.
     *
     * Employed on creation unless this is a laboratory or head office: a staff
     * account that belongs to nobody cannot do any work — every scoped query
     * resolves the employer through `employements` — and it does not appear on
     * the staff screen that just created it. The employer is whoever asked
     * unless the caller names another, so head office creating staff gets head
     * office's own employees and a laboratory gets its own.
     *
     * In a transaction because a refused employer used to leave the account
     * behind: created, employed by nobody, and on no list that would let
     * anybody find it again.
     */
    const { id, employment } = await db.transaction().execute(async (trx) => {
      const result = await trx
        .insertInto('users')
        .values({
          fullname: String(fullname),
          mobile: String(mobile),
          email: email ? String(email) : null,
          empid,
          password: hashed,
          role_id: role,
          is_active: 1,
          status: 1,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .executeTakeFirst();

      const id = Number(result.insertId);
      if (isSenior(role)) return { id, employment: null as number | null };

      // Head office may name the employer; a laboratory is always the employer
      // itself. Honouring a `lab_id` from a laboratory would let it put an
      // account on somebody else's books.
      const employerId = employerIsLab
        ? Number(req.user.id)
        : req.body?.lab_id
          ? Number(req.body.lab_id)
          : Number(req.user.labId ?? req.user.id);

      return {
        id,
        employment: await employ(
          id,
          employerId,
          {
            joining_date: req.body?.joining_date,
            salary: req.body?.salary,
            remark: req.body?.remark,
            week_off: req.body?.week_off,
            working_hours: req.body?.working_hours,
            late_after: req.body?.late_after,
            shift_start: req.body?.shift_start,
            shift_end: req.body?.shift_end,
          },
          trx,
        ),
      };
    });

    res.status(201).json({ data: { id, empid, employment } });
  }),
);

userRoutes.patch(
  '/:id/active',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    // A laboratory may act on its own staff and on nobody else.
    await assertEmploys(req.user, Number(req.params.id));
    const active = req.body?.is_active ? 1 : 0;
    const row = await db
      .selectFrom('users')
      .select('id')
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('User not found.');

    await db
      .updateTable('users')
      .set({ is_active: active, updated_at: new Date() })
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ ok: true });
  }),
);

/** Fields a person may change on their own record. */
const SELF_EDITABLE = [
  'fullname',
  'owner_name',
  'alt_mobile',
  'office_tel',
  'email',
  'official_email',
  'address',
  'city',
  'state',
  'country',
  'pincode',
  'gst_no',
  'bank_name',
  'account_holder',
  'bank_branch',
  'ifsc_code',
  'account_no',
  'account_type',
  'profile_photo',
  'company_logo',
  'signature',
  'documentation',
  'fax',
  'adhar_no',
  'adhar_photo',
  'pan_no',
  'pan_photo',
  'passport_no',
  'passport_photo',
  'dl_no',
  'dl_photo',
  'voter_id',
  'voter_photo',
  'id_proof_type',
  'address_proof_type',
] as const;

/**
 * The attachment list, checked before it is stored.
 *
 * `documents` is JSON, so this is the only column where the request decides the
 * shape of what is written rather than just its value. Everything is bounded:
 * how many entries, how long a title, and — the one that matters — where a
 * path may point. A path is a key inside the uploads area and nothing else, so
 * a request cannot name `/etc/passwd`, a URL on somebody else's host, or a
 * traversal out of the bucket, and have the panel render it back as a link.
 *
 * Returns the JSON to write, `null` to clear the column, or `undefined` when
 * the request did not mention documents at all.
 */
function documentsPatch(given: unknown): string | null | undefined {
  if (given === undefined) return undefined;
  if (given === null || given === '') return null;
  if (!Array.isArray(given)) throw badRequest('Documents must be a list.');
  if (given.length > 25) throw badRequest('An account can hold at most 25 documents.');

  const cleaned = given.map((entry, i) => {
    const at = `Document ${i + 1}`;
    if (!entry || typeof entry !== 'object') throw badRequest(`${at} is not a document.`);
    const row = entry as Record<string, unknown>;
    const path = String(row.path ?? '').trim();
    const title = String(row.title ?? '').trim();

    if (!path) throw badRequest(`${at} has no file.`);
    if (path.length > 255) throw badRequest(`${at} has an impossible path.`);
    if (!/^(public\/)?uploads\/[A-Za-z0-9._/-]+$/.test(path) || path.includes('..')) {
      throw badRequest(`${at} does not point at an uploaded file.`);
    }
    if (title.length > 191) throw badRequest(`${at} has a title longer than 191 characters.`);

    return {
      title: title || 'Untitled',
      path,
      // Kept from the client when it is already a valid date — a document
      // added last week and re-saved today should not claim to be new — and
      // stamped here otherwise.
      added_at: Number.isFinite(Date.parse(String(row.added_at)))
        ? new Date(String(row.added_at)).toISOString()
        : new Date().toISOString(),
    };
  });

  return JSON.stringify(cleaned);
}

/**
 * Update your own profile.
 *
 * Role, active flag and commission stay out of reach: they decide what the
 * account may do, and nobody grants themselves anything here.
 *
 * The **mobile number** is editable by head office only. It is the sign-in
 * identifier, so for everybody else changing it is an administrator's act —
 * but the administrator is somebody too, and telling the one person who *is*
 * head office to "ask an administrator" is telling them to ask themselves.
 *
 * Both the number and the address are checked against other accounts before
 * they are written. Sign-in matches on the number and resolves a collision
 * with the password; a reset has no password to resolve it with. Two accounts
 * on one number or one address is therefore a mess that shows up months later
 * as somebody unable to reset — cheaper to refuse at the moment it is typed.
 */
userRoutes.patch(
  '/me',
  requireLabScope,
  wrap(async (req, res) => {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    for (const key of SELF_EDITABLE) {
      if (req.body?.[key] !== undefined) {
        // `String(null)` is the four-character word "null", which is how rows
        // ended up holding it as a value. Empty and absent both mean "no
        // value" and both become a real NULL.
        const given = req.body[key];
        patch[key] = given === '' || given === null || given === undefined ? null : String(given);
      }
    }

    // JSON, so it goes through its own door rather than the string loop above.
    const documents = documentsPatch(req.body?.documents);
    if (documents !== undefined) patch.documents = documents;

    if (req.body?.mobile !== undefined) {
      if (req.user.roleId !== ROLE.SUPER) {
        throw badRequest('Only head office can change the mobile number on an account.');
      }
      const mobile = String(req.body.mobile).trim();
      if (!mobile) throw badRequest('Mobile number cannot be blank.');

      const taken = await db
        .selectFrom('users')
        .select('id')
        .where('mobile', '=', mobile)
        .where('id', '!=', req.user.id)
        .where('is_active', '=', 1)
        .executeTakeFirst();
      if (taken) {
        throw conflict('Another active account already signs in with that mobile number.');
      }
      patch.mobile = mobile;
    }

    if (patch.email) {
      const taken = await db
        .selectFrom('users')
        .select(['id', 'fullname'])
        .where('email', '=', String(patch.email))
        .where('id', '!=', req.user.id)
        .where('is_active', '=', 1)
        .executeTakeFirst();
      if (taken) {
        throw conflict(
          `That email address is already on ${taken.fullname}'s account. A password reset ` +
            'cannot tell two accounts apart by address, so each needs its own.',
        );
      }
    }

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');
    if (patch.fullname !== undefined && !patch.fullname) {
      throw badRequest('Name cannot be blank.');
    }

    await db.updateTable('users').set(patch as never).where('id', '=', req.user.id).execute();

    const row = await db
      .selectFrom('users')
      .select(PUBLIC_COLUMNS)
      .where('id', '=', req.user.id)
      .executeTakeFirstOrThrow();

    res.json({ data: row });
  }),
);

/**
 * Read one account. Administrators only — staff read themselves at /me.
 *
 * The current employment comes with it. Who somebody works for and since when
 * is half of what an employee record is, and it lives in another table, so a
 * screen showing one person had to page the whole staff list to find them.
 * Null when nobody employs them — a laboratory, head office, or somebody whose
 * employment was ended.
 */
userRoutes.get(
  '/:id',
  numericId,
  /*
    Whoever may change the account may read it — the same guard and the same
    per-record check `PATCH /:id` runs.

    They had drifted apart: a laboratory could save an employee and could not
    fetch one, so pressing Edit on its own staff answered "Requires super admin
    access" from the request that fills the form. The narrower half was the
    read, which is the half that gives nothing away it could not already save.
  */
  requireEmployer,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    // A laboratory may read its own staff and nobody else's.
    await assertEmploys(req.user, id);

    const row = await db
      .selectFrom('users')
      .select(PUBLIC_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Account not found.');

    res.json({ data: { ...row, employment: await currentEmployment(id) } });
  }),
);

/**
 * Update any account. Administrators only. Mobile can be changed here, so it is
 * checked against every other account first — the column carries no unique
 * constraint, and duplicates are what locked three staff out of the old system.
 */
userRoutes.patch(
  '/:id',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    // A laboratory may act on its own staff and on nobody else.
    await assertEmploys(req.user, Number(req.params.id));
    const id = Number(req.params.id);
    const row = await db
      .selectFrom('users')
      .select(['id', 'empid'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Account not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    for (const key of SELF_EDITABLE) {
      if (req.body?.[key] !== undefined) {
        // `String(null)` is the four-character word "null", which is how rows
        // ended up holding it as a value. Empty and absent both mean "no
        // value" and both become a real NULL.
        const given = req.body[key];
        patch[key] = given === '' || given === null || given === undefined ? null : String(given);
      }
    }

    // JSON, so it goes through its own door rather than the string loop above.
    const documents = documentsPatch(req.body?.documents);
    if (documents !== undefined) patch.documents = documents;

    if (req.body?.mobile !== undefined) {
      const mobile = String(req.body.mobile).trim();
      if (!mobile) throw badRequest('Mobile number cannot be blank.');
      const clash = await db
        .selectFrom('users')
        .select('id')
        .where('mobile', '=', mobile)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (clash) {
        throw conflict(
          `Account ${clash.id} already uses that mobile number. Two accounts sharing a number is what locks people out of sign-in.`,
        );
      }
      patch.mobile = mobile;
    }

    if (req.body?.role_id !== undefined) {
      const wanted =
        req.body.role_id === null || req.body.role_id === '' ? null : Number(req.body.role_id);
      await assertRoleAssignable(req.user, wanted);
      patch.role_id = wanted;
    }
    if (req.body?.is_active !== undefined) patch.is_active = req.body.is_active ? 1 : 0;
    if (req.body?.commision !== undefined) patch.commision = Number(req.body.commision);
    // Which reading applies to that number. Anything but the two known values
    // would leave the rate meaning whatever the next reader assumes.
    if (req.body?.commission_type !== undefined) {
      const given = String(req.body.commission_type);
      if (given !== 'percent' && given !== 'per_pc') {
        throw badRequest('Commission type is "percent" or "per_pc".');
      }
      patch.commission_type = given;
    }
    if (req.body?.registration_fee !== undefined) {
      // Money, so blank is "not recorded" rather than zero: a fee of ₹0 and a
      // fee nobody has agreed yet print differently on the form.
      const fee = req.body.registration_fee;
      patch.registration_fee =
        fee === '' || fee === null || fee === undefined ? null : String(Number(fee));
    }
    // The statement terms are head office's to set: a laboratory choosing its
    // own grace days is a laboratory deciding when it pays.
    const terms = ['statement_period', 'statement_grace_days', 'statement_from'];
    if (terms.some((k) => req.body?.[k] !== undefined) && req.user.roleId !== ROLE.SUPER) {
      throw forbidden('Only head office sets a laboratory’s statement terms.');
    }
    if (req.body?.statement_period !== undefined) {
      const months = Number(req.body.statement_period);
      if (![0, 1, 3, 6, 12].includes(months)) {
        throw badRequest('Statement period is None (0), or 1, 3, 6 or 12 months.');
      }
      patch.statement_period = months;
    }
    if (req.body?.statement_grace_days !== undefined) {
      const days = Number(req.body.statement_grace_days);
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        throw badRequest('Grace days is a whole number from 0 to 365.');
      }
      patch.statement_grace_days = days;
    }
    if (req.body?.statement_from !== undefined) {
      const given = String(req.body.statement_from ?? '').trim();
      if (given && !/^\d{4}-\d{2}(-\d{2})?$/.test(given)) throw badRequest('Billing starts is a month, YYYY-MM.');
      patch.statement_from = given ? `${given.slice(0, 7)}-01` : null;
    }
    if (req.body?.empid !== undefined) {
      // Blanking is refused rather than accepted as "no employee ID": an
      // account without one cannot employ anybody, and the staff list joins
      // through it, so the person would vanish from the screen that cleared
      // it. An empty field means "leave it alone" nowhere else either.
      const empid = String(req.body.empid ?? '').trim();
      if (!empid) throw badRequest('Employee ID cannot be blank.');
      if (empid !== row.empid && (await empidTaken(empid, id))) {
        throw conflict(`Another account already uses the employee ID ${empid}.`);
      }

      // An empid is a key, not only a label: `employements.parent_id` and
      // `users.parent_id` name an employer by it, and there is no foreign key
      // in this schema to refuse a rename that orphans them. This is that
      // refusal. Changing the empid of somebody nobody works for is fine.
      if (empid !== row.empid && row.empid) {
        const [posting, staff] = await Promise.all([
          db
            .selectFrom('employements')
            .select('id')
            .where('parent_id', '=', row.empid)
            .executeTakeFirst(),
          db.selectFrom('users').select('id').where('parent_id', '=', row.empid).executeTakeFirst(),
        ]);
        if (posting || staff) {
          throw conflict(
            `Employments still point at "${row.empid}". Changing it would leave those people working for nobody — move them first.`,
          );
        }
      }

      patch.empid = empid;
    }

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('users').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

/**
 * Delete an account.
 *
 * There are no foreign keys in this schema, so nothing but this refuses to
 * leave a student attached to a laboratory that no longer exists. An account
 * anybody's work still points at cannot be deleted — deactivate it instead,
 * which is what `is_active` is for and what keeps the history readable.
 */
userRoutes.delete(
  '/:id',
  numericId,
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw badRequest('You cannot delete your own account.');

    const row = await db
      .selectFrom('users')
      .select(['id', 'empid', 'fullname'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Account not found.');

    // Counted rather than merely detected: "14 students" tells somebody what
    // to do next where "in use" does not.
    const count = async (q: Promise<{ n: unknown } | undefined>) => Number((await q)?.n ?? 0);
    const [students, orders, staff] = await Promise.all([
      count(
        db
          .selectFrom('students')
          .select(({ fn }) => fn.countAll().as('n'))
          .where('lab_id', '=', id)
          .executeTakeFirst(),
      ),
      count(
        db
          .selectFrom('orders')
          .where('deleted_at', 'is', null)
          .select(({ fn }) => fn.countAll().as('n'))
          .where('lab_id', '=', id)
          .executeTakeFirst(),
      ),
      row.empid
        ? count(
            db
              .selectFrom('employements')
              .select(({ fn }) => fn.countAll().as('n'))
              .where('parent_id', '=', row.empid)
              .executeTakeFirst(),
          )
        : Promise.resolve(0),
    ]);

    const held = [
      students && `${students} student${students === 1 ? '' : 's'}`,
      orders && `${orders} order${orders === 1 ? '' : 's'}`,
      staff && `${staff} staff member${staff === 1 ? '' : 's'}`,
    ].filter(Boolean);

    if (held.length > 0) {
      throw conflict(
        `${row.fullname} still has ${held.join(', ')}. Deactivate the account instead — deleting it would leave those records belonging to nobody.`,
      );
    }

    await db.deleteFrom('user_permissions').where('user_id', '=', id).execute();
    await db.deleteFrom('users').where('id', '=', id).execute();

    invalidatePermissions();
    res.json({ ok: true });
  }),
);

/** Reset someone else's password. Administrators only. */
userRoutes.post(
  '/:id/password',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    // A laboratory may act on its own staff and on nobody else.
    await assertEmploys(req.user, Number(req.params.id));
    const password = String(req.body?.password ?? '');
    if (password.length < 8) throw badRequest('Password must be at least 8 characters.');

    const row = await db
      .selectFrom('users')
      .select('id')
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('Account not found.');

    await db
      .updateTable('users')
      .set({ password: await bcrypt.hash(password, 10), updated_at: new Date() })
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ ok: true, note: 'Tell them their new password through a separate channel.' });
  }),
);

// ------------------------------------------------------------- employment

/**
 * The one place `users.parent_id` is written.
 *
 * `employements` is the record of employment — one row per posting, with the
 * joining date, the salary and the leave date, so somebody who moves between
 * laboratories has a history. `users.parent_id` is a denormalised copy of the
 * **current** employer, so that answering "whose staff is this" costs no join.
 *
 * Two copies can disagree, so every endpoint that changes an employment goes
 * through here, and `npm run check:parents` reports any row where they have
 * drifted anyway — which the Laravel application will cause until cutover,
 * since it writes `employements` and knows nothing about this column.
 *
 * The employer is named by their `empid`, the same value the employment row
 * carries, so the two copies stay comparable without a join.
 */
async function setEmployer(userId: number, parentEmpid: string | null, exec: Exec = db) {
  await exec
    .updateTable('users')
    .set({ parent_id: parentEmpid, updated_at: new Date() })
    .where('id', '=', userId)
    .execute();
}


/**
 * Put somebody on an employer's books, and record who that employer is.
 *
 * The one path that writes an employment, used both when an account is created
 * and when an existing one is moved. It writes the two copies together — the
 * `employements` row, which is the history, and `users.parent_id`, which is
 * the shortcut — so they cannot be written apart.
 *
 * The employer is head office or a laboratory. Head office employs people too:
 * its own staff hold `parent_id` = head office's empid, and the staff screen
 * reads them back by the employer's role.
 */
/**
 * The days of the week somebody is off, as stored.
 *
 * `0`–`6`, Sunday first — the numbering `Date.getDay()` and MySQL's `DAYOFWEEK`
 * both count in, so nothing has to translate. Sorted and de-duplicated, so
 * "0,0,6" and "6,0" are one answer written twice.
 *
 * Empty means no fixed day off, which is what every row said before this
 * column existed. NULL rather than '' so the two cannot both mean it.
 */
function weekOff(given: unknown): string | null {
  const list = Array.isArray(given) ? given : String(given ?? '').split(',');
  const days = [
    ...new Set(
      list
        .map((v) => String(v).trim())
        // Blanks dropped before Number, not after: `Number('')` is 0, so ''
        // would be stored as Sunday.
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    ),
  ].sort((a, b) => a - b);
  return days.length ? days.join(',') : null;
}

/**
 * Hours in a full day, as stored: `DECIMAL(4,2)`, so 8.5 is a real answer.
 * Blank is not set, and then nobody is marked short.
 */
function workingHours(given: unknown): string | null {
  const raw = String(given ?? '').trim();
  if (!raw) return null;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw badRequest('Working hours must be a number of hours, more than 0 and at most 24.');
  }
  return String(Math.round(hours * 100) / 100);
}

/**
 * A time of day as `HH:MM:00` — the same shape as `clockIn`, so the two compare
 * as strings. Blank is not set.
 */
function clockTime(given: unknown, label: string): string | null {
  const raw = String(given ?? '').trim();
  if (!raw) return null;
  const hit = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(raw);
  if (!hit) throw badRequest(`${label} must be a time, HH:MM.`);
  return `${hit[1]}:${hit[2]}:00`;
}

/** The time after which a punch-in is late. Blank is not set: nobody is late. */
const lateAfter = (given: unknown) => clockTime(given, 'Late after');

/**
 * The shift as the form sends it: a start and an end.
 *
 * When either is in the body all three columns are written — the two times and
 * the hours between them — so `working_hours` can never disagree with the times
 * beside it. A shift that ends at or before it starts runs past midnight.
 * Neither in the body: undefined, and the stored shift is left as it is.
 */
function shiftTimes(body: { shift_start?: unknown; shift_end?: unknown }) {
  if (body.shift_start === undefined && body.shift_end === undefined) return undefined;
  const start = clockTime(body.shift_start, 'Start time');
  const end = clockTime(body.shift_end, 'End time');
  if (Boolean(start) !== Boolean(end)) throw badRequest('Give both a start and an end time, or neither.');
  if (!start || !end) return { shift_start: null, shift_end: null, working_hours: null };
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let span = minutes(end) - minutes(start);
  if (span <= 0) span += 24 * 60;
  return { shift_start: start, shift_end: end, working_hours: String(Math.round((span / 60) * 100) / 100) };
}

async function employ(
  userId: number,
  employerId: number,
  details: {
    joining_date?: unknown;
    salary?: unknown;
    remark?: unknown;
    week_off?: unknown;
    working_hours?: unknown;
    late_after?: unknown;
    shift_start?: unknown;
    shift_end?: unknown;
  } = {},
  exec: Exec = db,
): Promise<number> {
  if (!Number.isInteger(employerId) || employerId < 1) {
    throw badRequest('Choose an employer.');
  }
  // Read before anything is written, so a bad time fails the whole create.
  const shift = {
    working_hours: workingHours(details.working_hours),
    late_after: lateAfter(details.late_after),
    // Times, when given, write the hours as well.
    ...shiftTimes(details),
  };

  const [user, employer] = await Promise.all([
    exec.selectFrom('users').select(['id', 'role_id']).where('id', '=', userId).executeTakeFirst(),
    exec
      .selectFrom('users')
      .select(['id', 'role_id', 'empid'])
      .where('id', '=', employerId)
      .executeTakeFirst(),
  ]);
  if (!user) throw notFound('Account not found.');
  if (!employer) throw badRequest('That employer does not exist.');
  if (!isSenior(employer.role_id)) {
    throw badRequest('Only head office or a laboratory employs people.');
  }
  if (isSenior(user.role_id)) {
    throw badRequest('A laboratory is not employed by anybody — it is the employer.');
  }
  // An employment names its employer by empid, so an employer without one
  // cannot employ anybody. Refused here rather than written as NULL, which
  // the column does not accept and which would read as "works for nobody".
  if (!employer.empid) {
    throw badRequest(
      'That employer has no employee ID. Give it one before employing anybody there — an employment records the employer by their empid.',
    );
  }

  const existing = await exec
    .selectFrom('employements')
    .select('id')
    .where('user_id', '=', userId)
    .where('is_working', '=', '1')
    .executeTakeFirst();
  if (existing) {
    throw conflict('This person already works somewhere. End that first.');
  }

  const result = await exec
    .insertInto('employements')
    .values({
      user_id: userId,
      parent_id: employer.empid,
      joining_date: String(details.joining_date ?? new Date().toISOString().slice(0, 10)),
      salary: String(details.salary ?? '0'),
      week_off: weekOff(details.week_off),
      ...shift,
      is_working: '1',
      leave_date: '',
      remark: String(details.remark ?? ''),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .executeTakeFirst();

  await setEmployer(userId, employer.empid, exec);

  return Number(result.insertId);
}

/**
 * Attach a person to an employer. Without this an account created through
 * POST /api/users belongs to nobody and cannot do any work, because every
 * scoped query resolves the employer through this table. The create route
 * calls the same helper, so an account made on the staff screen arrives
 * employed.
 */
userRoutes.post(
  '/:id/employment',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    // A laboratory may act on its own staff and on nobody else.
    await assertEmploys(req.user, Number(req.params.id));
    const id = await employ(Number(req.params.id), Number(req.body?.lab_id), {
      joining_date: req.body?.joining_date,
      salary: req.body?.salary,
      remark: req.body?.remark,
      week_off: req.body?.week_off,
      working_hours: req.body?.working_hours,
      late_after: req.body?.late_after,
      shift_start: req.body?.shift_start,
      shift_end: req.body?.shift_end,
    });

    res.status(201).json({ data: { id } });
  }),
);

/**
 * Change the terms of the posting somebody currently holds.
 *
 * The salary and the joining date are on the employment, not on the account,
 * so `PATCH /api/users/{id}` cannot reach them — and a salary typed on the
 * create screen has to be correctable afterwards. Moving somebody to another
 * employer is not this: that is ending one employment and starting another,
 * which keeps the history.
 */
userRoutes.patch(
  '/:id/employment',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    // A laboratory may act on its own staff and on nobody else.
    await assertEmploys(req.user, Number(req.params.id));
    const row = await db
      .selectFrom('employements')
      .select('id')
      .where('user_id', '=', Number(req.params.id))
      .where('is_working', '=', '1')
      .executeTakeFirst();
    if (!row) throw notFound('This person is not currently employed anywhere.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (req.body?.salary !== undefined) {
      const salary = Number(req.body.salary);
      if (!Number.isFinite(salary) || salary < 0) {
        throw badRequest('Salary must be a number, and not negative.');
      }
      patch.salary = String(salary);
    }
    if (req.body?.joining_date !== undefined) {
      const joining = String(req.body.joining_date ?? '').trim();
      if (joining && !/^\d{4}-\d{2}-\d{2}$/.test(joining)) {
        throw badRequest('Joining date must be YYYY-MM-DD.');
      }
      patch.joining_date = joining;
    }
    if (req.body?.remark !== undefined) patch.remark = String(req.body.remark ?? '');
    if (req.body?.week_off !== undefined) patch.week_off = weekOff(req.body.week_off);
    if (req.body?.working_hours !== undefined) patch.working_hours = workingHours(req.body.working_hours);
    if (req.body?.late_after !== undefined) patch.late_after = lateAfter(req.body.late_after);
    // After the hours, so a start and an end overrule an hours figure beside them.
    const times = shiftTimes(req.body ?? {});
    if (times) Object.assign(patch, times);

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db
      .updateTable('employements')
      .set(patch as never)
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ ok: true });
  }),
);

/** End an employment. Kept as a row so the history survives. */
userRoutes.post(
  '/:id/employment/end',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    // A laboratory may act on its own staff and on nobody else.
    await assertEmploys(req.user, Number(req.params.id));
    const row = await db
      .selectFrom('employements')
      .select('id')
      .where('user_id', '=', Number(req.params.id))
      .where('is_working', '=', '1')
      .executeTakeFirst();
    if (!row) throw notFound('This person is not currently employed anywhere.');

    await db
      .updateTable('employements')
      .set({
        is_working: '0',
        leave_date: String(req.body?.leave_date ?? new Date().toISOString().slice(0, 10)),
        remark: String(req.body?.remark ?? ''),
        updated_at: new Date(),
      })
      .where('id', '=', Number(row.id))
      .execute();

    // Nobody's staff any more. Their last employer stays on the employment row,
    // where the history belongs; carrying it on the user would say they still
    // work there.
    await setEmployer(Number(req.params.id), null);

    res.json({ ok: true });
  }),
);

/**
 * Who may set an employee's permissions, and which permissions that employee
 * can have.
 *
 *   head office     any employee — its own staff, and any laboratory's.
 *   a laboratory    its own staff only.
 *   anybody else    nobody. The routes take `requireEmployer`; this refuses
 *                   again for the one case that guard cannot see, a person
 *                   acting on themselves.
 *
 * An employee could once reach these routes, and their "laboratory" is their
 * employer — so they passed the "works for your laboratory" test for every
 * colleague and for themselves, and could grant themselves anything.
 *
 * Only employees have permissions: head office and laboratory accounts are
 * unconditional, and somebody employed by nobody has no side for a permission
 * to belong to. The kind returned is the side the employee is on, which
 * decides the rows their permission screen lists.
 */
async function assertMayGrant(user: Express.Request['user'], targetId: number) {
  if (Number(targetId) === Number(user.id)) {
    throw forbidden('Nobody can change their own permissions.');
  }
  if (user.roleId !== ROLE.SUPER && user.roleId !== ROLE.LAB) {
    throw forbidden('Only head office or the laboratory that employs someone can change their permissions.');
  }

  const target = await staffKindOfUser(targetId);
  const exists = await db.selectFrom('users').select('id').where('id', '=', targetId).executeTakeFirst();
  if (!exists) throw notFound('User not found.');

  if (isSenior(target.roleId)) {
    throw forbidden('Head office and laboratory accounts are not limited by permissions.');
  }
  if (!target.kind || target.employerId === null) {
    throw badRequest('This person works for nobody, so there is no side for a permission to belong to. Employ them first.');
  }
  if (user.roleId === ROLE.LAB && target.employerId !== Number(user.id)) {
    throw forbidden('That person does not work for your laboratory.');
  }

  return { id: targetId, role_id: target.roleId, kind: target.kind };
}

// ------------------------------------------------------------ permissions

/**
 * What one person may actually do: their own grants, then their role, limited
 * to the permissions their side can have.
 *
 * The same resolution `can()` uses on every request, so a screen that hides a
 * control on this answer hides exactly what the API would refuse.
 * `staff_of` says whose employee they are — `head_office`, `laboratory`, or
 * null for head office and laboratory accounts — which is what the panel
 * decides their menu from.
 */
userRoutes.get(
  '/me/permissions',
  requireLabScope,
  wrap(async (req, res) => {
    res.json({ data: await effectivePermissionsFor(req.user), staff_of: await staffKindOf(req.user) });
  }),
);

/**
 * One employee's own permissions: every permission their side can have, each
 * with what it opens (`description`), which boxes mean anything
 * (`abilities`), and `own` — whether they hold a row of their own for it.
 * `staff_of` is their side.
 */
userRoutes.get(
  '/:id/permissions',
  numericParams('id'),
  requireEmployer,
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    const target = await assertMayGrant(req.user, userId);
    res.json({ data: await userPermissionsFor(userId, target.kind), staff_of: target.kind });
  }),
);

/**
 * Grant or withdraw one permission for one person.
 *
 * An individual grant **replaces** the role's answer for that action rather than
 * adding to it, so this can take away as well as give. All four flags off is
 * still a grant — it says "not this, whatever the role says" — and is how a
 * person is held back from something their role allows. Clearing it entirely is
 * DELETE, which puts them back on their role.
 */
userRoutes.put(
  '/:id/permissions',
  numericParams('id'),
  requireEmployer,
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    const target = await assertMayGrant(req.user, userId);

    const action = String(req.body?.action_type ?? '');
    if (!(await isActionType(action))) throw badRequest(`${action} is not a permission.`);
    if (!appliesTo(action, target.kind)) {
      throw badRequest(
        target.kind === 'laboratory'
          ? `${action} is not a permission a laboratory’s employee can have.`
          : `${action} is not a permission a head office employee can have.`,
      );
    }

    const set = {
      view: req.body?.view ? 1 : 0,
      create: req.body?.create ? 1 : 0,
      update: req.body?.update ? 1 : 0,
      delete: req.body?.delete ? 1 : 0,
    };
    // A flag the permission does not use is stored off.
    for (const a of ABILITIES) if (!PERMISSION_SCOPE[action].abilities.includes(a)) set[a] = 0;

    const existing = await db
      .selectFrom('user_permissions')
      .select('id')
      .where('user_id', '=', userId)
      .where('action_type', '=', action)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('user_permissions')
        .set({ ...set, granted_by: req.user.id, updated_at: new Date() })
        .where('id', '=', Number(existing.id))
        .execute();
    } else {
      await db
        .insertInto('user_permissions')
        .values({
          user_id: userId,
          action_type: action,
          ...set,
          granted_by: req.user.id,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    }

    invalidatePermissions();
    res.json({ ok: true });
  }),
);

/** Drop an individual grant, putting the person back on their role. */
userRoutes.delete(
  '/:id/permissions/:action',
  numericParams('id'),
  requireEmployer,
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    await assertMayGrant(req.user, userId);

    const result = await db
      .deleteFrom('user_permissions')
      .where('user_id', '=', userId)
      .where('action_type', '=', String(req.params.action))
      .executeTakeFirst();

    invalidatePermissions();
    res.json({ ok: true, removed: Number(result.numDeletedRows) > 0 });
  }),
);


