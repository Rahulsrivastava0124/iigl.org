import type { RequestHandler } from 'express';
import { db } from '../db/index.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/** Role ids as they exist in the `roles` table. */
export const ROLE = {
  ADMIN: 1,
  LAB: 2,
  // 3 = LAB EMPLOYEE, 4 = MANAGER, 5 = Office Boy.
  // The Laravel guard admits role_id > 2, so staff roles are open-ended.
} as const;

export interface SessionUser {
  id: number;
  fullname: string;
  roleId: number;
  /** Lab this user belongs to: itself for a lab, the employer for staff. */
  labId: number | null;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

declare global {
  namespace Express {
    interface Request {
      user: SessionUser;
    }
  }
}

/**
 * Resolves the lab a user acts on behalf of. Labs are their own lab; staff
 * inherit it from the employements table. Mirrors getParentLab() in
 * app/Helpers/Commonfunction.php, which crashes for lab users.
 */
export async function resolveLabId(userId: number, roleId: number): Promise<number | null> {
  if (roleId === ROLE.LAB) return userId;

  const row = await db
    .selectFrom('employements')
    .select('parent_id')
    .where('user_id', '=', userId)
    .where('is_working', '=', '1')
    .executeTakeFirst();

  return row ? Number(row.parent_id) : null;
}

/** Every route is authenticated unless it is explicitly mounted as public. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.user) return next(unauthorized());
  req.user = req.session.user;
  next();
};

export const requireRole =
  (predicate: (roleId: number) => boolean, label: string): RequestHandler =>
  (req, _res, next) => {
    if (!req.session.user) return next(unauthorized());
    req.user = req.session.user;
    if (!predicate(req.user.roleId)) return next(forbidden(`Requires ${label} access.`));
    next();
  };

export const requireAdmin = requireRole((r) => r === ROLE.ADMIN, 'administrator');
export const requireLab = requireRole((r) => r === ROLE.LAB, 'laboratory');
export const requireStaff = requireRole((r) => r > ROLE.LAB, 'employee');
/**
 * Anyone who operates laboratory data: the lab itself, its staff, or an
 * administrator. Note that admin is role 1, *below* lab at 2, so a numeric
 * `>= ROLE.LAB` test silently excludes administrators — the per-record
 * ownership check is what narrows each role's view, not this guard.
 */
export const requireLabScope = requireRole(
  (r) => r === ROLE.ADMIN || r >= ROLE.LAB,
  'laboratory or administrator',
);

/**
 * Throws unless the row belongs to the caller's lab. Admins see everything.
 * The Laravel app has no equivalent — any id in a URL is readable by anyone.
 */
export function assertLabOwnership(user: SessionUser, rowLabId: number | null): void {
  if (user.roleId === ROLE.ADMIN) return;
  if (rowLabId === null || user.labId === null || rowLabId !== user.labId) {
    throw forbidden('This record belongs to another laboratory.');
  }
}
