import { db } from '../db/index.js';
import { forbidden } from '../lib/errors.js';
import { ROLE, type SessionUser } from '../middleware/auth.js';

/**
 * Role permissions.
 *
 * `role_permissions` holds one row per role per action type, each carrying
 * view, create, update and delete flags. The Laravel application reads it
 * through `filterPermission()` and changes what a person sees — an employee
 * without view and create on `product_collection` sees only the orders they
 * received or were assigned, rather than the whole laboratory queue.
 *
 * Without this the new API would show every staff member everything their
 * laboratory has, which is a widening of access rather than a port.
 *
 * The matrix is small and changes rarely, so it is cached for a minute. A
 * permission change therefore takes effect within a minute rather than
 * instantly; that is the trade for not querying it on every request.
 */

/** The action types present in the live data. */
export const ACTION_TYPES = [
  'account',
  'admin_employee',
  'customer',
  'employee_management',
  'laboratory',
  'product_collection',
  'report',
  'visitor_book',
  'website_blog',
  'website_contact',
  'website_education',
  'website_enquiry',
  'website_home',
  'website_report',
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];
export type Ability = 'view' | 'create' | 'update' | 'delete';

export interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

const CACHE_MS = 60_000;
let cache: { at: number; byRole: Map<number, Map<string, Permission>> } | null = null;

async function matrix(): Promise<Map<number, Map<string, Permission>>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byRole;

  const rows = await db
    .selectFrom('role_permissions')
    .select(['role_id', 'action_type', 'view', 'create', 'update', 'delete'])
    .execute();

  const byRole = new Map<number, Map<string, Permission>>();
  for (const r of rows) {
    const roleId = Number(r.role_id);
    if (!byRole.has(roleId)) byRole.set(roleId, new Map());
    byRole.get(roleId)!.set(r.action_type, {
      action_type: r.action_type,
      view: Boolean(r.view),
      create: Boolean(r.create),
      update: Boolean(r.update),
      delete: Boolean(r.delete),
    });
  }

  cache = { at: Date.now(), byRole };
  return byRole;
}

/** Drops the cache so a permission edit is visible immediately. */
export function invalidatePermissions(): void {
  cache = null;
}

export async function permissionsFor(roleId: number): Promise<Permission[]> {
  const byRole = await matrix();
  const own = byRole.get(roleId);
  // A role with no rows is treated as having no rights rather than all of them.
  return ACTION_TYPES.map(
    (action_type) =>
      own?.get(action_type) ?? {
        action_type,
        view: false,
        create: false,
        update: false,
        delete: false,
      },
  );
}

/**
 * Whether a user may do something.
 *
 * Administrators and laboratories are unconditional; the matrix describes what
 * *employees* may do.
 *
 * That is not a shortcut, it is what the data says. Every role 2 row in
 * `role_permissions` is zero across view, create, update and delete, and the
 * Laravel laboratory sidebar contains no permission check at all — it never
 * reads those rows. Only the employee sidebar and the employee branches of the
 * controllers call `filterPermission()`. Reading the zeros literally would lock
 * a laboratory out of its own counter.
 */
export async function can(
  user: SessionUser,
  action: ActionType,
  ability: Ability,
): Promise<boolean> {
  if (user.roleId === ROLE.ADMIN || user.roleId === ROLE.LAB) return true;
  const byRole = await matrix();
  return Boolean(byRole.get(user.roleId)?.get(action)?.[ability]);
}

/** Everything granted, for the roles the matrix does not describe. */
export function fullPermissions(): Permission[] {
  return ACTION_TYPES.map((action_type) => ({
    action_type,
    view: true,
    create: true,
    update: true,
    delete: true,
  }));
}

export async function assertCan(
  user: SessionUser,
  action: ActionType,
  ability: Ability,
): Promise<void> {
  if (!(await can(user, action, ability))) {
    throw forbidden(`Your role does not have ${ability} access to ${action.replace(/_/g, ' ')}.`);
  }
}

/**
 * How far an order list should reach for this user.
 *
 * Mirrors OrderController: with view and create on `product_collection` a
 * person sees the laboratory's orders; without, only the ones they took or were
 * assigned. Laboratories and administrators always see everything in scope.
 */
export async function orderVisibility(
  user: SessionUser,
): Promise<'all' | 'lab' | 'own'> {
  if (user.roleId === ROLE.ADMIN) return 'all';
  if (user.roleId === ROLE.LAB) return 'lab';

  const byRole = await matrix();
  const p = byRole.get(user.roleId)?.get('product_collection');
  return p?.view && p?.create ? 'lab' : 'own';
}
