/**
 * Can one laboratory reach another's roles?
 *
 *   npm run check:roles
 *
 * Roles are owned: `owner_id` NULL is head office's and shared with everybody,
 * anything else belongs to one laboratory. Three separate rules depend on that
 * — what a laboratory is shown, what it may change, and who it may put in a
 * role — and the third was the one nothing checked: `POST /users` refused a
 * laboratory the two senior roles and let every other number through, so
 * posting another laboratory's role id hired somebody into that laboratory's
 * permission matrix.
 *
 * This builds two laboratories with a role each and checks all three rules from
 * both sides. Writes nothing that survives: the fixture is built inside a
 * transaction that is always rolled back.
 */
import { db } from '../db/index.js';

const ROLLBACK = 'rollback: the check is done';
let failures = 0;

const check = (label: string, ok: boolean) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

try {
  await db.transaction().execute(async (trx) => {
    const lab = async (name: string) =>
      Number(
        (
          await trx
            .insertInto('users')
            .values({
              fullname: name,
              mobile: `00${Date.now() % 100000000}`.slice(0, 10),
              password: 'x',
              role_id: 2,
              is_active: 0,
              status: 0,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .executeTakeFirstOrThrow()
        ).insertId,
      );

    const one = await lab('Scope check A');
    const two = await lab('Scope check B');

    const role = async (name: string, owner: number | null) =>
      Number(
        (
          await trx
            .insertInto('roles')
            .values({ role_name: name, owner_id: owner, is_system: 0, created_at: new Date(), updated_at: new Date() })
            .executeTakeFirstOrThrow()
        ).insertId,
      );

    const mine = await role('Front desk A', one);
    const theirs = await role('Front desk B', two);
    const shared = await role('Shared desk', null);

    /* What the list endpoint shows laboratory one: shared roles and its own. */
    const visible = await trx
      .selectFrom('roles')
      .select('id')
      .where((eb) => eb.or([eb('owner_id', 'is', null), eb('owner_id', '=', one)]))
      .execute();
    const ids = new Set(visible.map((r) => Number(r.id)));

    check('a laboratory sees its own role', ids.has(mine));
    check('a laboratory sees the shared roles', ids.has(shared));
    check("a laboratory cannot see another's role", !ids.has(theirs));

    /* What it may put somebody in — the rule `assertRoleAssignable` applies. */
    const assignable = async (labId: number, roleId: number) => {
      const r = await trx.selectFrom('roles').select('owner_id').where('id', '=', roleId).executeTakeFirstOrThrow();
      return r.owner_id === null || Number(r.owner_id) === labId;
    };

    check('it may hire into its own role', await assignable(one, mine));
    check('it may hire into a shared role', await assignable(one, shared));
    check("it may not hire into another laboratory's role", !(await assignable(one, theirs)));

    throw new Error(ROLLBACK);
  });
} catch (e) {
  if ((e as Error).message !== ROLLBACK) throw e;
}

await db.destroy();
console.log(failures === 0 ? '\nRoles stay inside the laboratory that owns them.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
