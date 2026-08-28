import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { requireAdmin, requireLabScope, ROLE } from '../middleware/auth.js';
import {
  invalidatePermissions,
  permissionsFor,
  fullPermissions,
  ACTION_TYPES,
} from '../services/permission.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const userRoutes = Router();

/** Columns safe to return. Never selects password or remember_token. */
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
  'profile_photo',
  'company_logo',
  'signature',
  'commision',
  'is_active',
  'status',
  'role_id',
  'created_at',
] as const;

userRoutes.get(
  '/me',
  requireLabScope,
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('users')
      .select(PUBLIC_COLUMNS)
      .where('id', '=', req.user.id)
      .executeTakeFirstOrThrow();
    res.json({ data: row });
  }),
);

/** Laboratories. Admin sees all; a lab sees only itself. */
userRoutes.get(
  '/laboratories',
  requireLabScope,
  wrap(async (req, res) => {
    let q = db.selectFrom('users').select(PUBLIC_COLUMNS).where('role_id', '=', ROLE.LAB);
    if (req.user.roleId !== ROLE.ADMIN) q = q.where('id', '=', req.user.labId);
    res.json({ data: await q.orderBy('fullname').execute() });
  }),
);

/** Staff of a lab, joined through employements. */
userRoutes.get(
  '/staff',
  requireLabScope,
  wrap(async (req, res) => {
    const p = readPage(req);
    const labId = req.user.roleId === ROLE.ADMIN ? Number(req.query.lab_id) || null : req.user.labId;

    // Qualified column names: the join puts a `mobile` on both sides.
    const search = readSearch(req, ['users.fullname', 'users.mobile', 'users.email']);

    const base = () => {
      let q = db
        .selectFrom('employements')
        .innerJoin('users', 'users.id', 'employements.user_id')
        .where('employements.is_working', '=', '1');
      if (labId !== null) q = q.where('employements.parent_id', '=', labId);
      if (search) q = q.where(search);
      return q;
    };

    // Counted separately: passing the page length as the total made
    // total_pages always 1, so a client could never page past the first screen.
    const [rows, count] = await Promise.all([
      base()
        .select([
          'users.id as id',
          'users.fullname as fullname',
          'users.mobile as mobile',
          'users.role_id as role_id',
          'users.is_active as is_active',
          'employements.parent_id as lab_id',
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

userRoutes.get(
  '/roles',
  requireLabScope,
  wrap(async (_req, res) => {
    res.json({ data: await db.selectFrom('roles').selectAll().orderBy('id').execute() });
  }),
);

/** Creating accounts is administrator-only. */
userRoutes.post(
  '/',
  requireAdmin,
  wrap(async (req, res) => {
    const { fullname, mobile, password, role_id, email } = req.body ?? {};
    if (!fullname || !mobile || !password || !role_id) {
      throw badRequest('Name, mobile, password and role are required.');
    }
    if (String(password).length < 8) throw badRequest('Password must be at least 8 characters.');

    const clash = await db
      .selectFrom('users')
      .select('id')
      .where('mobile', '=', String(mobile))
      .executeTakeFirst();
    if (clash) throw conflict('An account with that mobile number already exists.');

    const result = await db
      .insertInto('users')
      .values({
        fullname: String(fullname),
        mobile: String(mobile),
        email: email ? String(email) : null,
        password: await bcrypt.hash(String(password), 10),
        role_id: Number(role_id),
        is_active: 1,
        status: 1,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
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

/** Read one account. Administrators only — staff read themselves at /me. */
userRoutes.get(
  '/:id',
  numericId,
  requireAdmin,
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('users')
      .select(PUBLIC_COLUMNS)
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('Account not found.');
    res.json({ data: row });
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
    const row = await db.selectFrom('users').select('id').where('id', '=', id).executeTakeFirst();
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

    if (req.body?.role_id !== undefined) patch.role_id = Number(req.body.role_id);
    if (req.body?.is_active !== undefined) patch.is_active = req.body.is_active ? 1 : 0;
    if (req.body?.commision !== undefined) patch.commision = Number(req.body.commision);
    if (req.body?.empid !== undefined) patch.empid = req.body.empid ? String(req.body.empid) : null;

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
 * Attach a person to a laboratory. Without this an account created through
 * POST /api/users belongs to nobody and cannot do any work, because every
 * scoped query resolves the laboratory through this table.
 */
userRoutes.post(
  '/:id/employment',
  numericId,
  requireAdmin,
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    const labId = Number(req.body?.lab_id);
    if (!Number.isInteger(labId) || labId < 1) throw badRequest('Choose a laboratory.');

    const [user, lab] = await Promise.all([
      db.selectFrom('users').select(['id', 'role_id']).where('id', '=', userId).executeTakeFirst(),
      db.selectFrom('users').select(['id', 'role_id']).where('id', '=', labId).executeTakeFirst(),
    ]);
    if (!user) throw notFound('Account not found.');
    if (!lab) throw badRequest('That laboratory does not exist.');
    if (Number(lab.role_id) !== ROLE.LAB) throw badRequest('That account is not a laboratory.');
    if (Number(user.role_id) <= ROLE.LAB) {
      throw badRequest('Only staff accounts are employed by a laboratory.');
    }

    const existing = await db
      .selectFrom('employements')
      .select('id')
      .where('user_id', '=', userId)
      .where('is_working', '=', '1')
      .executeTakeFirst();
    if (existing) {
      throw conflict('This person already works at a laboratory. End that first.');
    }

    const result = await db
      .insertInto('employements')
      .values({
        user_id: userId,
        parent_id: labId,
        joining_date: String(req.body?.joining_date ?? new Date().toISOString().slice(0, 10)),
        salary: String(req.body?.salary ?? '0'),
        is_working: '1',
        leave_date: '',
        remark: String(req.body?.remark ?? ''),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
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

    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------ permissions

/** The permission matrix for a role. */
userRoutes.get(
  '/roles/:id/permissions',
  numericParams('id'),
  requireLabScope,
  wrap(async (req, res) => {
    res.json({ data: await permissionsFor(Number(req.params.id)) });
  }),
);

/** What the signed-in user may do, so a client can hide what it should. */
userRoutes.get(
  '/me/permissions',
  requireLabScope,
  wrap(async (req, res) => {
    // A laboratory answers here the same way an administrator does: its rows in
    // the matrix are all zero and Laravel never reads them. See can().
    const unconditional =
      req.user.roleId === ROLE.ADMIN || req.user.roleId === ROLE.LAB;

    res.json({
      data: unconditional ? fullPermissions() : await permissionsFor(req.user.roleId),
    });
  }),
);

/** Replace the permissions for one action type on one role. */
userRoutes.put(
  '/roles/:id/permissions',
  numericParams('id'),
  requireAdmin,
  wrap(async (req, res) => {
    const roleId = Number(req.params.id);
    const action = String(req.body?.action_type ?? '');
    if (!(ACTION_TYPES as readonly string[]).includes(action)) {
      throw badRequest(`Unknown action type. Expected one of: ${ACTION_TYPES.join(', ')}.`);
    }

    const flags = {
      view: req.body?.view ? 1 : 0,
      create: req.body?.create ? 1 : 0,
      update: req.body?.update ? 1 : 0,
      delete: req.body?.delete ? 1 : 0,
    };

    const existing = await db
      .selectFrom('role_permissions')
      .select('id')
      .where('role_id', '=', roleId)
      .where('action_type', '=', action)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('role_permissions')
        .set({ ...flags, updated_at: new Date() })
        .where('id', '=', Number(existing.id))
        .execute();
    } else {
      await db
        .insertInto('role_permissions')
        .values({
          role_id: roleId,
          action_type: action,
          ...flags,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    }

    // The matrix is cached; drop it so the change is visible at once.
    invalidatePermissions();
    res.json({ ok: true });
  }),
);
