import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { requireAdmin, requireLabScope, ROLE } from '../middleware/auth.js';
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

    const base = () => {
      let q = db
        .selectFrom('employements')
        .innerJoin('users', 'users.id', 'employements.user_id')
        .where('employements.is_working', '=', '1');
      if (labId !== null) q = q.where('employements.parent_id', '=', labId);
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
