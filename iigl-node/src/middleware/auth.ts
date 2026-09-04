import type { RequestHandler } from 'express';
import { db } from '../db/index.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { readSession, type SessionUser } from '../lib/session.js';

export type { SessionUser };

/**
 * Role ids as they exist in the `roles` table.
 *
 *   1  super admin   IIGL head office
 *   2  admin         a laboratory — **the same account**: a laboratory user is
 *                    its admin, not a separate kind of person
 *   3  team          their staff. 4 (manager) and 5 (office boy) predate this
 *                    and are team variants; a custom role is anything above.
 *
 * `role_id` is nullable, and NULL is not a role: it is somebody whose
 * permissions were granted to them one row at a time.
 */
export const ROLE = {
  SUPER: 1,
  /** A laboratory. `ADMIN` and `LAB` are the same number because they are the same account. */
  ADMIN: 2,
  LAB: 2,
  TEAM: 3,
} as const;

/** Nobody's role. Their grants in `user_permissions` are all they have. */
export const NO_ROLE = null;

declare global {
  namespace Express {
    interface Request {
      user: SessionUser;
    }
  }
}

/**
 * The `empid` that identifies one account, for writing into a parent column.
 *
 * `employements.parent_id` and `users.parent_id` name an employer by their
 * `users.empid` (migration 009), not by their id, so anything that has a user
 * id and needs to read or write a parent column goes through here. Returns
 * null when the account has no empid — which no live account does, but the
 * column is nullable and a caller that assumed otherwise would write the
 * string "null" into somebody's employment.
 */
export async function empidOf(userId: number): Promise<string | null> {
  const row = await db
    .selectFrom('users')
    .select('empid')
    .where('id', '=', userId)
    .executeTakeFirst();

  return row?.empid ?? null;
}

/**
 * Resolves the lab a user acts on behalf of. Labs are their own lab; staff
 * inherit it from the employements table. Mirrors getParentLab() in
 * app/Helpers/Commonfunction.php, which crashes for lab users.
 *
 * The employment names its employer by `empid`, and everything downstream —
 * `orders.lab_id`, the scope checks, the ownership assertions — is keyed by
 * user id, so the join back through `users.empid` is what this function is
 * for. A `parent_id` that resolves to nobody (Laravel still writes a numeric
 * one until cutover) drops the row and returns null: belonging to nobody is
 * the honest answer, and `npm run check:parents` names those rows.
 */
export async function resolveLabId(userId: number, roleId: number | null): Promise<number | null> {
  if (roleId === ROLE.LAB) return userId;

  const row = await db
    .selectFrom('employements')
    .innerJoin('users as employer', 'employer.empid', 'employements.parent_id')
    .select('employer.id as id')
    .where('employements.user_id', '=', userId)
    .where('employements.is_working', '=', '1')
    .executeTakeFirst();

  return row ? Number(row.id) : null;
}

/** Every route is authenticated unless it is explicitly mounted as public. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const user = readSession(req);
  if (!user) return next(unauthorized());
  req.user = user;
  next();
};

export const requireRole =
  (predicate: (roleId: number | null) => boolean, label: string): RequestHandler =>
  (req, _res, next) => {
    const user = readSession(req);
    if (!user) return next(unauthorized());
    req.user = user;
    if (!predicate(user.roleId)) return next(forbidden(`Requires ${label} access.`));
    next();
  };

/** Head office only. Named for the route group it guards, not for role 2. */
export const requireSuper = requireRole((r) => r === ROLE.SUPER, 'super admin');
export const requireAdmin = requireSuper;
export const requireLab = requireRole((r) => r === ROLE.LAB, 'laboratory');
export const requireStaff = requireRole((r) => r !== null && r > ROLE.LAB, 'employee');
/**
 * Somebody who employs people: head office, or a laboratory.
 *
 * A laboratory hires and manages its own staff — the Laravel panel did not let
 * it, and this does. `requireAdmin` is what guarded these routes before, which
 * is head office alone, so a laboratory could see its employee list and add
 * nobody to it.
 *
 * This admits the two roles. It does **not** say whose staff they may touch:
 * `assertEmploys` is that check, and every route here runs both.
 */
export const requireEmployer = requireRole(
  (r) => r === ROLE.SUPER || r === ROLE.LAB,
  'laboratory or administrator',
);

/**
 * Throws unless the caller may act on this account.
 *
 * Head office may act on anybody. A laboratory may act only on somebody
 * currently employed under its own `empid` — its staff, and nobody else's, and
 * never another laboratory or head office.
 *
 * The employment is what decides it rather than any column on the account,
 * because `employements.parent_id` is the only place the relationship is
 * recorded, and it holds the employer's **empid** rather than their id.
 *
 * Deliberately the same answer for "not your employee" and "no such account":
 * a laboratory that can tell the two apart can walk the id range and learn how
 * many accounts exist and where the gaps are.
 */
export async function assertEmploys(user: SessionUser, targetId: number): Promise<void> {
  if (user.roleId === ROLE.SUPER) return;

  const empid = await empidOf(user.id);
  if (!empid) throw forbidden('This account employs nobody.');

  const employment = await db
    .selectFrom('employements')
    .select('id')
    .where('user_id', '=', targetId)
    .where('parent_id', '=', empid)
    .where('is_working', '=', '1')
    .executeTakeFirst();

  if (!employment) throw forbidden('That account is not one of your employees.');
}

/**
 * Anyone who operates laboratory data: a laboratory, its staff, or head office.
 * Written as an explicit `SUPER` test beside the `>= LAB` one so the guard says
 * what it admits rather than relying on the numbers happening to line up. The
 * per-record ownership check is what narrows each role's view, not this.
 */
export const requireLabScope = requireRole(
  (r) => r === ROLE.SUPER || (r !== null && r >= ROLE.LAB),
  'laboratory or administrator',
);

/**
 * Throws unless the row belongs to the caller's lab. Admins see everything.
 * The Laravel app has no equivalent — any id in a URL is readable by anyone.
 */
export function assertLabOwnership(user: SessionUser, rowLabId: number | null): void {
  if (user.roleId === ROLE.SUPER) return;
  if (rowLabId === null || user.labId === null || rowLabId !== user.labId) {
    throw forbidden('This record belongs to another laboratory.');
  }
}
