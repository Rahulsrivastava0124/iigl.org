import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { ROLE, requireAdmin, requireLabScope } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
import {
  actionTypes,
  invalidatePermissions,
  isActionType,
  permissionsFor,
} from '../services/permission.service.js';

/**
 * Roles, and the permissions on them.
 *
 * Head office and a laboratory can both create a role. Whose role it is decides
 * who may edit it and who may be given it:
 *
 *   owner_id NULL   head office's. Offered to every laboratory, edited only by
 *                   head office.
 *   owner_id = 12   laboratory 12's. Only that laboratory sees it, edits it, or
 *                   can put somebody in it.
 *   is_system = 1   the five that shipped. Renamed and granted like any other;
 *                   only the three the code branches on by number — 1, 2 and 3
 *                   — refuse to be deleted. See ESSENTIAL below.
 *
 * A laboratory owning its own roles is the point of the feature. Without the
 * owner column, one laboratory renaming "Front desk" would rename it for six
 * others.
 */
export const roleRoutes = Router();
roleRoutes.use(requireLabScope);

const text = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim());

const requireText = (v: unknown, field: string): string => {
  const s = text(v);
  if (!s) throw badRequest(`${field} is required.`);
  return s;
};

const flags = (b: any) => ({
  view: b?.view ? 1 : 0,
  create: b?.create ? 1 : 0,
  update: b?.update ? 1 : 0,
  delete: b?.delete ? 1 : 0,
});

/** Who this person is allowed to own roles as: head office owns none. */
const ownerFor = (user: Express.Request['user']): number | null =>
  user.roleId === ROLE.SUPER ? null : Number(user.labId ?? user.id);

/** A role this person may see. Head office sees every one. */
async function visible(user: Express.Request['user'], roleId: number) {
  const role = await db
    .selectFrom('roles')
    .selectAll()
    .where('id', '=', roleId)
    .executeTakeFirst();
  if (!role) throw notFound('Role not found.');

  if (user.roleId === ROLE.SUPER) return role;

  const mine = ownerFor(user);
  if (role.owner_id === null || Number(role.owner_id) === mine) return role;
  throw forbidden('That role belongs to another laboratory.');
}

/**
 * A role whose **permissions** this person may set.
 *
 * Wider than `editable`: head office edits the matrix on the five system roles —
 * role 3 is what every existing employee holds, and its flags are the ported
 * behaviour — but nobody may rename or delete them. A laboratory may set the
 * permissions only on a role it owns: the shared roles are shared, and one
 * laboratory tightening "Lab employee" would tighten it for six others.
 */
async function grantable(user: Express.Request['user'], roleId: number) {
  const role = await visible(user, roleId);
  if (user.roleId === ROLE.SUPER) return role;

  if (role.is_system || role.owner_id === null) {
    throw forbidden('That role is shared. Make your own to change what it allows.');
  }
  return role;
}

/**
 * The three the code cannot do without.
 *
 * `ROLE.SUPER`, `ROLE.ADMIN` and `ROLE.TEAM` are branched on **by number** —
 * which door admits whom, which menu is drawn, which scope a query takes. Delete
 * one and the accounts holding it can still sign in, but nothing knows what they
 * are.
 *
 * That is the whole list. `is_system` also covers 4 (manager) and 5 (office
 * boy), which are older team variants nothing branches on, and treating them as
 * undeletable was the guard being lazy about the difference.
 */
const ESSENTIAL: readonly number[] = [ROLE.SUPER, ROLE.ADMIN, ROLE.TEAM];

/**
 * A role this person may rename.
 *
 * Renaming is safe for any of them, including the three above: nothing reads
 * `role_name` to make a decision — the code branches on the id, and the name is
 * a label on a screen. What a laboratory may not rename is a **shared** role,
 * because the name it chose would show for every other laboratory too.
 */
async function renameable(user: Express.Request['user'], roleId: number) {
  const role = await visible(user, roleId);
  if (user.roleId === ROLE.SUPER) return role;

  const mine = ownerFor(user);
  if (role.owner_id === null || Number(role.owner_id) !== mine) {
    throw forbidden('That role is shared. Rename one of your own, or ask head office.');
  }

  return role;
}

/**
 * A role this person may delete.
 *
 * Narrower than renaming: the three essential roles are refused outright, and a
 * laboratory may only delete a role it owns. The caller also has to have moved
 * everybody off it first — that check is on the route, because it needs to say
 * how many people are in the way.
 */
async function deletable(user: Express.Request['user'], roleId: number) {
  const role = await renameable(user, roleId);

  if (ESSENTIAL.includes(Number(role.id))) {
    throw forbidden(
      `${role.role_name} is one of the three roles the system is built on — super admin, admin and team. It can be renamed, but not deleted.`,
    );
  }

  return role;
}

// ------------------------------------------------------------------- roles

roleRoutes.get(
  '/',
  wrap(async (req, res) => {
    let q = db
      .selectFrom('roles')
      .select(['id', 'role_name', 'owner_id', 'is_system', 'description'])
      .orderBy('is_system', 'desc')
      .orderBy('id');

    // A laboratory sees the shared roles and its own, not another lab's.
    if (req.user.roleId !== ROLE.SUPER) {
      const mine = ownerFor(req.user);
      q = q.where((eb) => eb.or([eb('owner_id', 'is', null), eb('owner_id', '=', mine)]));
    }

    const rows = await q.execute();

    // How many people hold each, so a role cannot be deleted out from under
    // somebody without the screen having said so.
    const counts = await db
      .selectFrom('users')
      .select(({ fn }) => ['role_id', fn.countAll().as('n')])
      .groupBy('role_id')
      .execute();
    const held = new Map(counts.map((c) => [Number(c.role_id), Number(c.n)]));

    res.json({
      data: rows.map((r) => ({
        ...r,
        is_system: Boolean(r.is_system),
        mine: r.owner_id !== null && Number(r.owner_id) === ownerFor(req.user),
        users: held.get(Number(r.id)) ?? 0,
      })),
    });
  }),
);

roleRoutes.post(
  '/',
  wrap(async (req, res) => {
    const name = requireText(req.body?.name, 'Role name');
    const owner = ownerFor(req.user);

    // Unique within what this person can see: two laboratories may both have a
    // "Front desk", but one laboratory may not have two.
    const clash = await db
      .selectFrom('roles')
      .select('id')
      .where('role_name', '=', name)
      .where((eb) =>
        owner === null ? eb('owner_id', 'is', null) : eb.or([eb('owner_id', 'is', null), eb('owner_id', '=', owner)]),
      )
      .executeTakeFirst();
    if (clash) throw conflict(`A role called ${name} already exists.`);

    const result = await db
      .insertInto('roles')
      .values({
        role_name: name,
        owner_id: owner,
        is_system: 0,
        description: text(req.body?.description),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();

    invalidatePermissions();
    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

roleRoutes.patch(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const role = await renameable(req.user, Number(req.params.id));

    const patch: Record<string, unknown> = {};
    if (req.body?.name !== undefined) patch.role_name = requireText(req.body.name, 'Role name');
    if (req.body?.description !== undefined) patch.description = text(req.body.description);
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update.');
    patch.updated_at = new Date();

    await db.updateTable('roles').set(patch).where('id', '=', Number(role.id)).execute();
    invalidatePermissions();
    res.json({ ok: true });
  }),
);

roleRoutes.delete(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const role = await deletable(req.user, Number(req.params.id));

    // Counted rather than merely detected: "3 people hold this role" tells
    // somebody what to do next, where "somebody does" does not.
    const held = await db
      .selectFrom('users')
      .select(({ fn }) => fn.countAll().as('n'))
      .where('role_id', '=', Number(role.id))
      .executeTakeFirstOrThrow();
    const holders = Number(held.n);
    if (holders > 0) {
      throw conflict(
        `${holders} ${holders === 1 ? 'person holds' : 'people hold'} this role. Move ${
          holders === 1 ? 'them' : 'them all'
        } to another role first.`,
      );
    }

    await db.deleteFrom('role_permissions').where('role_id', '=', Number(role.id)).execute();
    await db.deleteFrom('roles').where('id', '=', Number(role.id)).execute();

    invalidatePermissions();
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------------- users

roleRoutes.get(
  '/:id/users',
  numericId,
  wrap(async (req, res) => {
    const role = await visible(req.user, Number(req.params.id));

    const users = await db
      .selectFrom('users')
      .select(['id', 'fullname', 'mobile', 'email', 'profile_photo', 'is_active'])
      .where('role_id', '=', Number(role.id))
      .orderBy('fullname')
      .execute();

    res.json({ data: users });
  }),
);

// ------------------------------------------------------------- permissions

roleRoutes.get(
  '/actions',
  wrap(async (_req, res) => {
    res.json({ data: await actionTypes() });
  }),
);

/**
 * A new permission to grant.
 *
 * Head office only, and honest about what it is: adding a name here puts it on
 * every permission screen, but nothing in the API reads it until a check is
 * written against it. The list marks those as not enforced.
 */
roleRoutes.post(
  '/actions',
  requireAdmin,
  wrap(async (req, res) => {
    const name = requireText(req.body?.name, 'Name')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    if (!name) throw badRequest('A name needs at least one letter or number.');

    if (await isActionType(name)) throw conflict(`${name} is already on the list.`);

    await db
      .insertInto('permission_actions')
      .values({
        name,
        label: requireText(req.body?.label ?? req.body?.name, 'Label'),
        description: text(req.body?.description),
        is_system: 0,
        added_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();

    invalidatePermissions();
    res.status(201).json({ data: { name } });
  }),
);

roleRoutes.get(
  '/:id/permissions',
  numericId,
  wrap(async (req, res) => {
    const role = await visible(req.user, Number(req.params.id));
    res.json({ data: await permissionsFor(Number(role.id)) });
  }),
);

/** Replace the flags for one action on one role. */
roleRoutes.put(
  '/:id/permissions',
  numericId,
  wrap(async (req, res) => {
    const role = await grantable(req.user, Number(req.params.id));

    const action = String(req.body?.action_type ?? '');
    if (!(await isActionType(action))) throw badRequest(`${action} is not a permission.`);

    const set = flags(req.body);
    const existing = await db
      .selectFrom('role_permissions')
      .select('id')
      .where('role_id', '=', Number(role.id))
      .where('action_type', '=', action)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('role_permissions')
        .set({ ...set, updated_at: new Date() })
        .where('id', '=', Number(existing.id))
        .execute();
    } else {
      await db
        .insertInto('role_permissions')
        .values({
          role_id: Number(role.id),
          action_type: action,
          ...set,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    }

    invalidatePermissions();
    res.json({ ok: true });
  }),
);
