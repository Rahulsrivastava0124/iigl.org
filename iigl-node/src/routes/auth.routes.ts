import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { requireAuth, resolveLabId, type SessionUser } from '../middleware/auth.js';

export const authRoutes = Router();

authRoutes.post(
  '/login',
  wrap(async (req, res) => {
    const { mobile, password } = req.body ?? {};
    if (!mobile || !password) throw badRequest('Enter your mobile number and password.');

    const row = await db
      .selectFrom('users')
      .select(['id', 'fullname', 'mobile', 'password', 'role_id', 'is_active', 'status'])
      .where('mobile', '=', String(mobile))
      .executeTakeFirst();

    // Same response whether the account is missing or the password is wrong,
    // so the endpoint cannot be used to enumerate registered mobile numbers.
    if (!row || !(await bcrypt.compare(String(password), row.password))) {
      throw unauthorized('That mobile number and password do not match.');
    }
    if (!row.is_active) throw unauthorized('This account has been deactivated.');

    const user: SessionUser = {
      id: Number(row.id),
      fullname: row.fullname,
      roleId: Number(row.role_id),
      labId: await resolveLabId(Number(row.id), Number(row.role_id)),
    };

    req.session.regenerate((err) => {
      if (err) throw err;
      req.session.user = user;
      res.json({ user });
    });
  }),
);

authRoutes.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRoutes.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRoutes.post(
  '/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const { current_password, new_password } = req.body ?? {};
    if (!current_password || !new_password) throw badRequest('Enter your current and new password.');
    if (String(new_password).length < 8) throw badRequest('New password must be at least 8 characters.');

    const row = await db
      .selectFrom('users')
      .select('password')
      .where('id', '=', req.user.id)
      .executeTakeFirstOrThrow();

    if (!(await bcrypt.compare(String(current_password), row.password))) {
      throw badRequest('Your current password is incorrect.');
    }

    // Cost 10 matches the existing Laravel hashes, so old and new rows stay uniform.
    await db
      .updateTable('users')
      .set({ password: await bcrypt.hash(String(new_password), 10), updated_at: new Date() })
      .where('id', '=', req.user.id)
      .execute();

    res.json({ ok: true });
  }),
);
