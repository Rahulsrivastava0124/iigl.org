import { db } from '../db/index.js';
import { forbidden } from '../lib/errors.js';
import { ROLE } from '../middleware/auth.js';
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
/**
 * The action types the API itself enforces.
 *
 * The full list now lives in `permission_actions`, which head office can add to
 * without a deployment. These are the names the server checks in code — a new
 * one added through the panel is a label on a screen until somebody writes the
 * check that reads it, and the panel says so where it is added.
 */
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
];
const CACHE_MS = 60_000;
let cache = null;
const asPermission = (r) => ({
    action_type: r.action_type,
    view: Boolean(r.view),
    create: Boolean(r.create),
    update: Boolean(r.update),
    delete: Boolean(r.delete),
});
/**
 * The whole matrix — roles, individual grants and the action list — in three
 * queries, cached for a minute.
 *
 * Individual grants are small: one row per person per action, and only for
 * people who have been given something outside their role. Loading them with
 * the roles keeps `can()` a map lookup, which matters because it is called on
 * routes that already do real work.
 */
async function load() {
    if (cache && Date.now() - cache.at < CACHE_MS)
        return cache;
    const [roleRows, userRows, actionRows] = await Promise.all([
        db
            .selectFrom('role_permissions')
            .select(['role_id', 'action_type', 'view', 'create', 'update', 'delete'])
            .execute(),
        db
            .selectFrom('user_permissions')
            .select(['user_id', 'action_type', 'view', 'create', 'update', 'delete'])
            .execute(),
        db
            .selectFrom('permission_actions')
            .select(['name', 'label', 'description', 'is_system'])
            .orderBy('is_system', 'desc')
            .orderBy('label')
            .execute(),
    ]);
    const byRole = new Map();
    for (const r of roleRows) {
        const roleId = Number(r.role_id);
        if (!byRole.has(roleId))
            byRole.set(roleId, new Map());
        byRole.get(roleId).set(r.action_type, asPermission(r));
    }
    const byUser = new Map();
    for (const r of userRows) {
        const userId = Number(r.user_id);
        if (!byUser.has(userId))
            byUser.set(userId, new Map());
        byUser.get(userId).set(r.action_type, asPermission(r));
    }
    const enforced = new Set(ACTION_TYPES);
    const actions = actionRows.map((a) => ({
        name: a.name,
        label: a.label,
        description: a.description,
        is_system: Boolean(a.is_system),
        enforced: enforced.has(a.name),
    }));
    cache = { at: Date.now(), byRole, byUser, actions };
    return cache;
}
/** Drops the cache so a permission edit is visible immediately. */
export function invalidatePermissions() {
    cache = null;
}
/** Every action a permission can be granted on, in the order a screen shows them. */
export async function actionTypes() {
    return (await load()).actions;
}
/** Whether a name exists in `permission_actions`. */
export async function isActionType(name) {
    return (await load()).actions.some((a) => a.name === name);
}
/** A blank row, for an action nobody has been granted. */
const none = (action_type) => ({
    action_type,
    view: false,
    create: false,
    update: false,
    delete: false,
});
/** The matrix for one role, one row per action, with the gaps filled in. */
export async function permissionsFor(roleId) {
    const { byRole, actions } = await load();
    const own = byRole.get(roleId);
    return actions.map((a) => own?.get(a.name) ?? none(a.name));
}
/**
 * What one person has been granted individually — every action, with `own`
 * saying which of them they actually have a row for.
 *
 * The gaps are filled in so a screen can list every action, but a filled gap
 * and a stored row of four zeros are **not** the same thing: the first means
 * "whatever the role says", the second means "not this, whatever the role
 * says". Both look like four unticked boxes, so the flags alone cannot tell
 * them apart and `own` is what does.
 */
export async function userPermissionsFor(userId) {
    const { byUser, actions } = await load();
    const mine = byUser.get(userId);
    return actions.map((a) => {
        const row = mine?.get(a.name);
        return { ...(row ?? none(a.name)), own: Boolean(row) };
    });
}
/**
 * What a person may actually do: their own grants first, then their role.
 *
 * An individual grant **replaces** the role's answer for that action rather
 * than adding to it, so a person can be given less than their role as well as
 * more. That is what makes a user with no role work at all: they have no role
 * rows, so their own are the only ones there are.
 */
export async function effectivePermissionsFor(user) {
    if (user.roleId === ROLE.SUPER || user.roleId === ROLE.LAB)
        return fullPermissions();
    const { byRole, byUser, actions } = await load();
    const mine = byUser.get(user.id);
    // No role at all: their own grants are the whole answer.
    const role = user.roleId === null ? undefined : byRole.get(user.roleId);
    return actions.map((a) => mine?.get(a.name) ?? role?.get(a.name) ?? none(a.name));
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
 *
 * Below those two, an individual grant wins over the role, and somebody with no
 * role has nothing but their own grants.
 */
export async function can(user, action, ability) {
    if (user.roleId === ROLE.SUPER || user.roleId === ROLE.LAB)
        return true;
    const { byRole, byUser } = await load();
    const own = byUser.get(user.id)?.get(action);
    if (own)
        return Boolean(own[ability]);
    if (user.roleId === null)
        return false;
    return Boolean(byRole.get(user.roleId)?.get(action)?.[ability]);
}
/** Everything granted, for the roles the matrix does not describe. */
export function fullPermissions() {
    return ACTION_TYPES.map((action_type) => ({
        action_type,
        view: true,
        create: true,
        update: true,
        delete: true,
    }));
}
export async function assertCan(user, action, ability) {
    if (!(await can(user, action, ability))) {
        throw forbidden(`You do not have ${ability} access to ${action.replace(/_/g, ' ')}.`);
    }
}
/**
 * How far an order list should reach for this user.
 *
 * Mirrors OrderController: with view and create on `product_collection` a
 * person sees the laboratory's orders; without, only the ones they took or were
 * assigned. Laboratories and administrators always see everything in scope.
 */
export async function orderVisibility(user) {
    if (user.roleId === ROLE.SUPER)
        return 'all';
    if (user.roleId === ROLE.LAB)
        return 'lab';
    // Read through the same resolution as can(): an individual grant of
    // product_collection has to widen the list, or granting it would appear to do
    // nothing.
    const view = await can(user, 'product_collection', 'view');
    const create = await can(user, 'product_collection', 'create');
    return view && create ? 'lab' : 'own';
}
