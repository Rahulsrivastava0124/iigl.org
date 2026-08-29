import { db } from '../db/index.js';

/**
 * Employee IDs.
 *
 * `empid` is not decoration. `employements.parent_id` and `users.parent_id`
 * name an employer by it (migration 009), so an account without one cannot
 * employ anybody and cannot be found by the staff list, which joins through
 * those columns. Laravel wrote one on every account it created; the Node
 * create route did not, which is how an employee ended up with a blank empid
 * and a blank parent.
 *
 * The shape is the one already in the data — a prefix, three zeros, then a
 * running number:
 *
 *   LAB0001, LAB0005    a laboratory
 *   EMP0007, EMP00012   somebody employed by one
 *
 * The zeros are a literal, not padding: `EMP00012` is `EMP` + `000` + `12`,
 * which is what the old application produced and what existing rows hold. The
 * number is a counter over accounts with that prefix, not a user id — id 16
 * holds EMP0007.
 */
export const LAB_PREFIX = 'LAB';
export const STAFF_PREFIX = 'EMP';

/** The prefix an account of this role gets. */
export const prefixFor = (roleId: number | null): string =>
  Number(roleId) === 2 ? LAB_PREFIX : STAFF_PREFIX;

/**
 * The next free empid for a prefix.
 *
 * Reads the highest number in use rather than counting rows: accounts get
 * deleted, and counting would hand out an id somebody already holds. `empid`
 * carries a unique constraint, so the caller retries on a clash — two requests
 * arriving together would otherwise both read the same maximum.
 */
export async function nextEmpid(prefix: string): Promise<string> {
  const rows = await db
    .selectFrom('users')
    .select('empid')
    .where('empid', 'like', `${prefix}%`)
    .execute();

  let highest = 0;
  for (const row of rows) {
    // Anything after the prefix that is not a number is somebody's hand-typed
    // id — left alone, and not allowed to stop the count.
    const digits = String(row.empid).slice(prefix.length);
    if (!/^\d+$/.test(digits)) continue;
    highest = Math.max(highest, Number(digits));
  }

  return `${prefix}000${highest + 1}`;
}

/** True when some other account already holds this empid. */
export async function empidTaken(empid: string, exceptUserId?: number): Promise<boolean> {
  let q = db.selectFrom('users').select('id').where('empid', '=', empid);
  if (exceptUserId !== undefined) q = q.where('id', '!=', exceptUserId);
  return Boolean(await q.executeTakeFirst());
}
