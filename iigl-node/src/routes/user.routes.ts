import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';

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
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { requireAdmin, requireLabScope, ROLE } from '../middleware/auth.js';
import { empidTaken, nextEmpid, prefixFor } from '../lib/empid.js';
import {
  effectivePermissionsFor,
  invalidatePermissions,
  isActionType,
  userPermissionsFor,
} from '../services/permission.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const userRoutes = Router();

/** Columns safe to return. Never selects password or remember_token. */
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
  'email',
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
  'ifsc_code',
  'account_no',
  // Laravel's spelling, kept: `adhar_*` and `pan_*` are the live column names.
  'adhar_no',
  'adhar_photo',
  'pan_no',
  'pan_photo',
  'fax',
  'documentation',
  'profile_photo',
  'company_logo',
  'signature',
  'commision',
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
    if (req.user.roleId !== ROLE.SUPER) q = q.where('id', '=', req.user.labId);
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

    res.json({ data: rows.map((r) => ({ ...r, staff: (r.empid && staff.get(r.empid)) || 0 })) });
  }),
);

/** Staff of a lab, joined through employements. */
userRoutes.get(
  '/staff',
  requireLabScope,
  wrap(async (req, res) => {
    const p = readPage(req);
    const labId = req.user.roleId === ROLE.SUPER ? Number(req.query.lab_id) || null : req.user.labId;

    // Qualified column names: the join puts a `mobile` on both sides.
    const search = readSearch(req, ['users.fullname', 'users.mobile', 'users.email']);

    const base = () => {
      let q = db
        .selectFrom('employements')
        .innerJoin('users', 'users.id', 'employements.user_id')
        // Who they work for. `employements.parent_id` is an `empid` — a
        // laboratory's, or head office's — so the employer's name comes from
        // the same table as the employee's, joined on that instead of on the
        // primary key. Left, so a parent that resolves to nobody still shows
        // the employee rather than hiding them.
        .leftJoin('users as employer', 'employer.empid', 'employements.parent_id')
        .where('employements.is_working', '=', '1');
      // Filtered on the employer's id rather than their empid: `labId` comes
      // from the session, which is keyed by user id like the rest of the API.
      if (labId !== null) q = q.where('employer.id', '=', labId);
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
          'employements.is_working as is_working',
        ])
        .orderBy('users.fullname')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      base().select(db.fn.countAll().as('n')).executeTakeFirstOrThrow(),
    ]);

    res.json(paged(rows, Number(count.n), p));
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
  requireAdmin,
  wrap(async (req, res) => {
    const { fullname, mobile, password, role_id, email } = req.body ?? {};
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

      const employerId = req.body?.lab_id
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
  requireAdmin,
  wrap(async (req, res) => {
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
  'email',
  'address',
  'city',
  'state',
  'country',
  'pincode',
  'gst_no',
  'bank_name',
  'ifsc_code',
  'account_no',
  'profile_photo',
  'company_logo',
  'signature',
  'documentation',
  'fax',
  'adhar_no',
  'adhar_photo',
  'pan_no',
  'pan_photo',
] as const;

/**
 * Update your own profile. Deliberately excludes mobile, role, active flag and
 * commission: the first is the sign-in identifier, and the rest decide what the
 * account may do.
 */
userRoutes.patch(
  '/me',
  requireLabScope,
  wrap(async (req, res) => {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    for (const key of SELF_EDITABLE) {
      if (req.body?.[key] !== undefined) {
        patch[key] = req.body[key] === '' ? null : String(req.body[key]);
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
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
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
  requireAdmin,
  wrap(async (req, res) => {
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
        patch[key] = req.body[key] === '' ? null : String(req.body[key]);
      }
    }

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
      patch.role_id =
        req.body.role_id === null || req.body.role_id === '' ? null : Number(req.body.role_id);
    }
    if (req.body?.is_active !== undefined) patch.is_active = req.body.is_active ? 1 : 0;
    if (req.body?.commision !== undefined) patch.commision = Number(req.body.commision);
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

/** Reset someone else's password. Administrators only. */
userRoutes.post(
  '/:id/password',
  numericId,
  requireAdmin,
  wrap(async (req, res) => {
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
async function employ(
  userId: number,
  employerId: number,
  details: { joining_date?: unknown; salary?: unknown; remark?: unknown } = {},
  exec: Exec = db,
): Promise<number> {
  if (!Number.isInteger(employerId) || employerId < 1) {
    throw badRequest('Choose an employer.');
  }

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
  requireAdmin,
  wrap(async (req, res) => {
    const id = await employ(Number(req.params.id), Number(req.body?.lab_id), {
      joining_date: req.body?.joining_date,
      salary: req.body?.salary,
      remark: req.body?.remark,
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
  requireAdmin,
  wrap(async (req, res) => {
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
  requireAdmin,
  wrap(async (req, res) => {
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
 * Who may grant permissions to whom.
 *
 * Head office may grant to anybody. A laboratory may grant only to its own
 * staff — and to nobody senior to itself, because a laboratory handing out
 * head-office rights is the one shape this feature must not take.
 */
async function assertMayGrant(user: Express.Request['user'], targetId: number) {
  const target = await db
    .selectFrom('users')
    .select(['id', 'role_id'])
    .where('id', '=', targetId)
    .executeTakeFirst();
  if (!target) throw notFound('User not found.');

  if (user.roleId === ROLE.SUPER) return target;

  if (isSenior(target.role_id) && Number(target.id) !== user.id) {
    throw forbidden('You cannot change the permissions of a laboratory or of head office.');
  }

  // The employment names its employer by empid; `user.labId` is a user id. The
  // join is what makes the two comparable, and an unresolvable parent fails the
  // check rather than passing it.
  const employment = await db
    .selectFrom('employements')
    .innerJoin('users as employer', 'employer.empid', 'employements.parent_id')
    .select('employer.id as employer_id')
    .where('employements.user_id', '=', targetId)
    .where('employements.is_working', '=', '1')
    .executeTakeFirst();

  const mine = Number(user.labId ?? user.id);
  if (!employment || Number(employment.employer_id) !== mine) {
    throw forbidden('That person does not work for your laboratory.');
  }

  return target;
}

// ------------------------------------------------------------ permissions

/**
 * What one person may actually do: their own grants, then their role.
 *
 * This is the same resolution `can()` uses on every request, so a screen that
 * hides a control on this answer hides exactly what the API would refuse.
 */
userRoutes.get(
  '/me/permissions',
  requireLabScope,
  wrap(async (req, res) => {
    res.json({ data: await effectivePermissionsFor(req.user) });
  }),
);

/** What one person has been granted individually, one row per action. */
userRoutes.get(
  '/:id/permissions',
  numericParams('id'),
  requireLabScope,
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    await assertMayGrant(req.user, userId);
    res.json({ data: await userPermissionsFor(userId) });
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
  requireLabScope,
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    await assertMayGrant(req.user, userId);

    const action = String(req.body?.action_type ?? '');
    if (!(await isActionType(action))) throw badRequest(`${action} is not a permission.`);

    const set = {
      view: req.body?.view ? 1 : 0,
      create: req.body?.create ? 1 : 0,
      update: req.body?.update ? 1 : 0,
      delete: req.body?.delete ? 1 : 0,
    };

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
  requireLabScope,
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


