import type { RequestHandler } from 'express';
import { db } from '../db/index.js';
import { forbidden } from '../lib/errors.js';
import { ROLE, type SessionUser } from '../middleware/auth.js';

/**
 * Employee permissions.
 *
 * `role_permissions` holds one row per role per action, each with view, create,
 * update and delete; `user_permissions` holds one person's own rows, which
 * replace their role's answer for that action.
 *
 * **Only employees are governed by these.** Head office (role 1) and a
 * laboratory (role 2) are unconditional: the laboratory account *is* its
 * admin, and every role 2 row in the ported data is zero. Everybody else is an
 * employee, and what an employee may do depends on two things:
 *
 *   whose employee   a laboratory's staff work a counter — orders,
 *                    certificates, customers. Head office's staff work head
 *                    office's screens — laboratories, customers, enquiries,
 *                    the website. `PERMISSION_SCOPE` says which permission
 *                    belongs to which, and a grant outside the person's side
 *                    is worth nothing: role 3 "Team" is shared by both, and
 *                    its website flags must not reach a laboratory's front
 *                    desk.
 *
 *   what was granted their own row for the action if they have one, else
 *                    their role's, else nothing.
 *
 * The API enforces every permission in `PERMISSION_SCOPE` on the routes it
 * names (`requirePermission`, `headOfficeOr`). Anything not in it — account,
 * employees, attendance, messages — is not an employee permission at all and
 * is not offered on any permission screen: attendance and messages are a
 * person's own records, and managing employees or money is the employer's.
 *
 * The matrix is cached for a minute and dropped on every edit, so a change
 * made from a permission screen applies on the next request.
 */

export type Ability = 'view' | 'create' | 'update' | 'delete';
export const ABILITIES: readonly Ability[] = ['view', 'create', 'update', 'delete'];

/** Whose employee somebody is. */
export type StaffKind = 'laboratory' | 'head_office';

export interface ActionScope {
  /** Which employees it can be granted to. */
  appliesTo: readonly StaffKind[];
  /** Which of the four flags mean something for it. The rest are always off. */
  abilities: readonly Ability[];
  /** What each flag lets them do, as the permission screens explain it. */
  description: string;
}

const ALL: readonly Ability[] = ABILITIES;

/**
 * Every permission an employee can be given, and exactly what it opens.
 *
 * Each entry is enforced where the description says. Adding one here without
 * guarding the routes it names is how a permission screen starts promising
 * something the API does not keep.
 */
export const PERMISSION_SCOPE: Record<string, ActionScope> = {
  product_collection: {
    appliesTo: ['laboratory'],
    abilities: ALL,
    description:
      'Orders. View and Add together show the whole laboratory’s orders — without both, only the orders they took or were given. Add takes a new order, its payment and its delivery; Edit also changes an order after it is taken; Delete removes an order or an item.',
  },
  report: {
    appliesTo: ['laboratory'],
    abilities: ['view', 'create', 'update'],
    description:
      'Certificates. View lists and prints them; Add issues a new one; Edit corrects one and hides it from the public site. Certificates are never deleted.',
  },
  customer: {
    appliesTo: ['laboratory', 'head_office'],
    abilities: ALL,
    description:
      'Customers. View lists them with their orders; Add registers a customer; Edit changes a registration, its discounts and whether the website shows it; Delete removes a registration (the orders stay). Head office staff see every laboratory’s customers.',
  },
  laboratory: {
    appliesTo: ['head_office'],
    abilities: ['view'],
    description:
      'Laboratories. View opens the franchise list and each laboratory’s page, agreement and registration form. Adding, editing or closing a laboratory stays with Super Admin.',
  },
  visitor_book: {
    appliesTo: ['head_office'],
    abilities: ALL,
    description:
      'The enquiry book: questions, visits, leads, complaints and franchise enquiries. View reads them; Add records one or a follow-up; Edit updates one; Delete removes one.',
  },
  website_enquiry: {
    appliesTo: ['head_office'],
    abilities: ALL,
    description:
      'Student enquiries. View reads them; Add records one or a follow-up; Edit updates or converts one; Delete removes one.',
  },
  website_home: {
    appliesTo: ['head_office'],
    abilities: ALL,
    description:
      'Website Setup — banners, and which laboratories and customers the website shows. View opens the tabs; Add a banner or branch page; Edit any of them or tick what shows; Delete a banner.',
  },
  website_report: {
    appliesTo: ['head_office'],
    abilities: ['view', 'create', 'update'],
    description: 'Website Setup — report types. View opens the tab; Add a type; Edit one.',
  },
  website_blog: {
    appliesTo: ['head_office'],
    abilities: ['view', 'create', 'update'],
    description: 'Website Setup — blog. View opens the tab; Add an article; Edit one.',
  },
};

/** Whether a permission can be given to this kind of employee at all. */
export const appliesTo = (action: string, kind: StaffKind | null) =>
  Boolean(kind && PERMISSION_SCOPE[action]?.appliesTo.includes(kind));

export interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

/** A permission row as the screens draw it: what it is, and which boxes mean anything. */
export interface DescribedPermission extends Permission {
  label: string;
  description: string;
  abilities: Ability[];
  applies_to: StaffKind[];
}

export interface PermissionAction {
  name: string;
  label: string;
  description: string | null;
  is_system: boolean;
  /** Whether an employee can be given it — every such permission is enforced. */
  enforced: boolean;
  abilities: Ability[];
  applies_to: StaffKind[];
}

const CACHE_MS = 60_000;

interface Cache {
  at: number;
  byRole: Map<number, Map<string, Permission>>;
  byUser: Map<number, Map<string, Permission>>;
  actions: PermissionAction[];
  /** users.id → role_id, for the employers staff resolve to. */
  roleOf: Map<number, number | null>;
}

let cache: Cache | null = null;

const asPermission = (r: {
  action_type: string;
  view: unknown;
  create: unknown;
  update: unknown;
  delete: unknown;
}): Permission => ({
  action_type: r.action_type,
  view: Boolean(r.view),
  create: Boolean(r.create),
  update: Boolean(r.update),
  delete: Boolean(r.delete),
});

async function load(): Promise<Cache> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const [roleRows, userRows, actionRows, employers] = await Promise.all([
    db.selectFrom('role_permissions').select(['role_id', 'action_type', 'view', 'create', 'update', 'delete']).execute(),
    db.selectFrom('user_permissions').select(['user_id', 'action_type', 'view', 'create', 'update', 'delete']).execute(),
    db
      .selectFrom('permission_actions')
      .select(['name', 'label', 'description', 'is_system'])
      .orderBy('is_system', 'desc')
      .orderBy('label')
      .execute(),
    // Only the two roles a staff member's employer can hold.
    db.selectFrom('users').select(['id', 'role_id']).where('role_id', 'in', [ROLE.SUPER, ROLE.LAB]).execute(),
  ]);

  const byRole = new Map<number, Map<string, Permission>>();
  for (const r of roleRows) {
    const roleId = Number(r.role_id);
    if (!byRole.has(roleId)) byRole.set(roleId, new Map());
    byRole.get(roleId)!.set(r.action_type, asPermission(r));
  }

  const byUser = new Map<number, Map<string, Permission>>();
  for (const r of userRows) {
    const userId = Number(r.user_id);
    if (!byUser.has(userId)) byUser.set(userId, new Map());
    byUser.get(userId)!.set(r.action_type, asPermission(r));
  }

  const actions: PermissionAction[] = actionRows.map((a) => {
    const scope = PERMISSION_SCOPE[a.name];
    return {
      name: a.name,
      label: a.label,
      description: scope?.description ?? a.description,
      is_system: Boolean(a.is_system),
      enforced: Boolean(scope),
      abilities: [...(scope?.abilities ?? [])],
      applies_to: [...(scope?.appliesTo ?? [])],
    };
  });

  const roleOf = new Map<number, number | null>(employers.map((u) => [Number(u.id), u.role_id]));

  cache = { at: Date.now(), byRole, byUser, actions, roleOf };
  return cache;
}

/** Drops the cache so a permission edit is visible immediately. */
export function invalidatePermissions(): void {
  cache = null;
}

/** Every action in `permission_actions`, with what it means for employees. */
export async function actionTypes(): Promise<PermissionAction[]> {
  return (await load()).actions;
}

/** Whether a name exists in `permission_actions`. */
export async function isActionType(name: string): Promise<boolean> {
  return (await load()).actions.some((a) => a.name === name);
}

const none = (action_type: string): Permission => ({
  action_type,
  view: false,
  create: false,
  update: false,
  delete: false,
});

/**
 * Whose employee this is: head office's, a laboratory's, or nobody's (head
 * office and laboratories themselves, and anybody with no employer).
 *
 * `labId` on the session is the employer's user id for staff, so this is a
 * lookup of that employer's role.
 */
export async function staffKindOf(user: { roleId: number | null; labId: number | null }): Promise<StaffKind | null> {
  if (user.roleId === ROLE.SUPER || user.roleId === ROLE.LAB) return null;
  if (!user.labId) return null;
  const { roleOf } = await load();
  const employerRole = roleOf.get(Number(user.labId));
  return employerRole === ROLE.SUPER ? 'head_office' : employerRole === ROLE.LAB ? 'laboratory' : null;
}

/** The same, for an account by id — for a screen acting on somebody else. */
export async function staffKindOfUser(userId: number): Promise<{ kind: StaffKind | null; roleId: number | null; employerId: number | null }> {
  const target = await db.selectFrom('users').select(['id', 'role_id']).where('id', '=', userId).executeTakeFirst();
  if (!target) return { kind: null, roleId: null, employerId: null };
  const employment = await db
    .selectFrom('employements')
    .innerJoin('users as employer', 'employer.empid', 'employements.parent_id')
    .select(['employer.id as id', 'employer.role_id as role_id'])
    .where('employements.user_id', '=', userId)
    .where('employements.is_working', '=', '1')
    .executeTakeFirst();
  const roleId = target.role_id;
  if (roleId === ROLE.SUPER || roleId === ROLE.LAB || !employment) {
    return { kind: null, roleId, employerId: employment ? Number(employment.id) : null };
  }
  const kind: StaffKind | null =
    employment.role_id === ROLE.SUPER ? 'head_office' : employment.role_id === ROLE.LAB ? 'laboratory' : null;
  return { kind, roleId, employerId: Number(employment.id) };
}

/** A row with every flag the permission does not use switched off. */
function masked(row: Permission, scope: ActionScope | undefined): Permission {
  const out = { ...row };
  for (const a of ABILITIES) if (!scope?.abilities.includes(a)) out[a] = false;
  return out;
}

/** Adds what a screen needs to draw a row: its name, explanation and usable boxes. */
async function described(rows: Permission[]): Promise<DescribedPermission[]> {
  const { actions } = await load();
  const labels = new Map(actions.map((a) => [a.name, a.label]));
  return rows.map((r) => {
    const scope = PERMISSION_SCOPE[r.action_type];
    return {
      ...masked(r, scope),
      label: labels.get(r.action_type) ?? r.action_type,
      description: scope?.description ?? '',
      abilities: [...(scope?.abilities ?? [])],
      applies_to: [...(scope?.appliesTo ?? [])],
    };
  });
}

/** The permissions that can be set on something for this kind (or both kinds, when null). */
function scopedNames(kind: StaffKind | 'both'): string[] {
  return Object.entries(PERMISSION_SCOPE)
    .filter(([, s]) => kind === 'both' || s.appliesTo.includes(kind))
    .map(([name]) => name);
}

/**
 * What a role can be granted: a laboratory's own role governs laboratory staff
 * only; a shared role (head office's, and the built-in team roles) may be held
 * by either, so it carries both sides.
 */
export async function permissionsFor(roleId: number, ownerId: number | null): Promise<DescribedPermission[]> {
  if (roleId === ROLE.SUPER) return [];
  const { byRole, actions } = await load();
  // A laboratory is not limited by permissions: it holds everything on its
  // side. Listed ticked, so its role says so instead of looking empty; it is
  // still refused on the way in (PUT /roles/2/permissions).
  if (roleId === ROLE.LAB) {
    const lab = new Set(scopedNames('laboratory'));
    return described(
      actions
        .filter((a) => lab.has(a.name))
        .map((a) => ({ action_type: a.name, view: true, create: true, update: true, delete: true })),
    );
  }
  const own = byRole.get(roleId);
  const names = new Set(scopedNames(ownerId === null ? 'both' : 'laboratory'));
  return described(actions.filter((a) => names.has(a.name)).map((a) => own?.get(a.name) ?? none(a.name)));
}

/** Which permissions a role may be given, for validating a write. */
export function grantableOnRole(ownerId: number | null): Set<string> {
  return new Set(scopedNames(ownerId === null ? 'both' : 'laboratory'));
}

/**
 * One employee's own grants — every permission their side can have, with `own`
 * saying which they actually hold a row for. A filled gap ("whatever the role
 * says") and a stored row of four zeros ("not this, whatever the role says")
 * look alike; `own` tells them apart.
 */
export async function userPermissionsFor(userId: number, kind: StaffKind): Promise<(DescribedPermission & { own: boolean })[]> {
  const { byUser, actions } = await load();
  const mine = byUser.get(userId);
  const names = new Set(scopedNames(kind));
  const rows = actions.filter((a) => names.has(a.name));
  const out = await described(rows.map((a) => mine?.get(a.name) ?? none(a.name)));
  return out.map((r) => ({ ...r, own: Boolean(mine?.get(r.action_type)) }));
}

/**
 * What a person may actually do, one row per permission — the answer `can()`
 * gives, so a screen that hides a control on it hides exactly what the API
 * refuses. Head office and laboratories get everything.
 */
export async function effectivePermissionsFor(user: SessionUser): Promise<Permission[]> {
  const { byRole, byUser, actions } = await load();
  if (user.roleId === ROLE.SUPER || user.roleId === ROLE.LAB) {
    return actions.map((a) => ({ action_type: a.name, view: true, create: true, update: true, delete: true }));
  }

  const kind = await staffKindOf(user);
  const mine = byUser.get(user.id);
  const role = user.roleId === null ? undefined : byRole.get(user.roleId);
  return actions.map((a) => {
    if (!appliesTo(a.name, kind)) return none(a.name);
    return masked(mine?.get(a.name) ?? role?.get(a.name) ?? none(a.name), PERMISSION_SCOPE[a.name]);
  });
}

/**
 * Whether a user may do something.
 *
 * Head office and laboratories: always. An employee: only for a permission
 * that belongs to their side and uses that flag, and then their own row, then
 * their role's, then no.
 */
export async function can(user: SessionUser, action: string, ability: Ability): Promise<boolean> {
  if (user.roleId === ROLE.SUPER || user.roleId === ROLE.LAB) return true;

  const scope = PERMISSION_SCOPE[action];
  if (!scope || !scope.abilities.includes(ability)) return false;
  const kind = await staffKindOf(user);
  if (!kind || !scope.appliesTo.includes(kind)) return false;

  const { byRole, byUser } = await load();
  const own = byUser.get(user.id)?.get(action);
  if (own) return Boolean(own[ability]);
  if (user.roleId === null) return false;
  return Boolean(byRole.get(user.roleId)?.get(action)?.[ability]);
}

export async function assertCan(user: SessionUser, action: string, ability: Ability): Promise<void> {
  if (!(await can(user, action, ability))) {
    throw forbidden(`You do not have ${ability} access to ${action.replace(/_/g, ' ')}.`);
  }
}

/** Head office, or one of its employees — the two that see across every laboratory. */
export async function isHeadOffice(user: SessionUser): Promise<boolean> {
  return user.roleId === ROLE.SUPER || (await staffKindOf(user)) === 'head_office';
}

const METHOD_ABILITY: Record<string, Ability> = {
  GET: 'view',
  HEAD: 'view',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

const abilityFor = (method: string, given?: Ability): Ability => given ?? METHOD_ABILITY[method] ?? 'view';

const wording: Record<Ability, string> = { view: 'see', create: 'add', update: 'change', delete: 'delete' };

/**
 * For laboratory routes: head office and laboratories pass; an employee needs
 * the permission. The ability defaults to the request method — GET view, POST
 * add, PATCH/PUT edit, DELETE delete — and can be given where a POST is an edit.
 */
export function requirePermission(action: string, ability?: Ability | Ability[]): RequestHandler {
  return (req, _res, next) => {
    // Several abilities: any one of them is enough (taking payment is Add or Edit).
    const wanted = Array.isArray(ability) ? ability : [abilityFor(req.method, ability)];
    Promise.all(wanted.map((a) => can(req.user, action, a)))
      .then((answers) =>
        answers.some(Boolean)
          ? next()
          : next(forbidden(`You do not have permission to ${wording[wanted[wanted.length - 1]]} ${labelOf(action)}. Ask your employer to grant it.`)),
      )
      .catch(next);
  };
}

/**
 * For head office's routes: head office passes, and so does one of its
 * employees who holds the permission. Nobody else — a laboratory or its staff
 * holding the same flag is refused, because the flag is head office's to give.
 */
export function headOfficeOr(action: string, ability?: Ability): RequestHandler {
  return (req, _res, next) => {
    if (req.user.roleId === ROLE.SUPER) return next();
    const wanted = abilityFor(req.method, ability);
    staffKindOf(req.user)
      .then(async (kind) => {
        if (kind === 'head_office' && (await can(req.user, action, wanted))) return next();
        next(
          forbidden(
            kind === 'head_office'
              ? `You do not have permission to ${wording[wanted]} ${labelOf(action)}. Ask Super Admin to grant it.`
              : 'Requires super admin access.',
          ),
        );
      })
      .catch(next);
  };
}

function labelOf(action: string): string {
  const names: Record<string, string> = {
    product_collection: 'orders',
    report: 'certificates',
    customer: 'customers',
    laboratory: 'laboratories',
    visitor_book: 'the enquiry book',
    website_enquiry: 'student enquiries',
    website_home: 'the website setup',
    website_report: 'report types',
    website_blog: 'the blog',
  };
  return names[action] ?? action.replace(/_/g, ' ');
}

/**
 * How far an order list reaches for this user. With view and add on orders an
 * employee sees the laboratory's; without both, only the orders they took or
 * were assigned. Ported from OrderController.
 */
export async function orderVisibility(user: SessionUser): Promise<'all' | 'lab' | 'own'> {
  if (user.roleId === ROLE.SUPER) return 'all';
  if (user.roleId === ROLE.LAB) return 'lab';
  const view = await can(user, 'product_collection', 'view');
  const create = await can(user, 'product_collection', 'create');
  return view && create ? 'lab' : 'own';
}
