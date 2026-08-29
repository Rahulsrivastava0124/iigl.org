/**
 * Does `users.parent_id` still agree with `employements`, and does it still
 * name somebody?
 *
 *   npm run check:parents
 *
 * `employements` is the record of employment — one row per posting, with dates
 * and a salary. `users.parent_id`, from migration 008, is a denormalised copy of
 * the **current** employer so that a scope check costs no join.
 *
 * Both name the employer by their `users.empid` (migration 009) rather than by
 * id, so there are two ways to be wrong now and this checks both: the two
 * columns disagreeing, and either of them naming an empid no account holds.
 * The second is what a renamed empid or a numeric parent looks like — the API
 * refuses the first and Laravel writes the second until cutover.
 *
 * Two copies of one fact can disagree, and this is the thing that notices. It
 * will disagree in one predictable way before cutover: the Laravel application
 * writes `employements` and knows nothing about the column, so anybody it hires,
 * moves or lets go drifts. Run this after Laravel has touched staff, and after
 * any hand-edit of either table.
 *
 * Read-only. It prints what to fix and the SQL that fixes it; it changes
 * nothing itself, because a repair that runs unattended is how a wrong value
 * gets copied over a right one.
 */
import { db } from '../db/index.js';

interface Row {
  id: number;
  fullname: string;
  role_id: number | null;
  on_user: string | null;
  on_employment: string | null;
  /** Whether each side names an account that exists. */
  user_resolves: boolean;
  employment_resolves: boolean;
}

const pad = (s: string, n: number) => s.padEnd(n);

async function main() {
  // Everybody with either side set, plus the working employment if there is
  // one. A left join both ways would need two queries anyway, so this reads
  // users and their current posting and compares in JavaScript, where the
  // three-way NULL comparison is legible.
  const rows = await db
    .selectFrom('users as u')
    .leftJoin('employements as e', (join) =>
      join.onRef('e.user_id', '=', 'u.id').on('e.is_working', '=', '1'),
    )
    // Each side is also looked up in `users`, so an empid that no account
    // holds is caught as well as the two sides disagreeing.
    .leftJoin('users as up', 'up.empid', 'u.parent_id')
    .leftJoin('users as ep', 'ep.empid', 'e.parent_id')
    .select([
      'u.id as id',
      'u.fullname as fullname',
      'u.role_id as role_id',
      'u.parent_id as on_user',
      'e.parent_id as on_employment',
      'up.id as user_parent',
      'ep.id as employment_parent',
    ])
    .execute();

  const drifted: Row[] = [];
  for (const r of rows as unknown as Array<
    Omit<Row, 'user_resolves' | 'employment_resolves'> & {
      user_parent: number | null;
      employment_parent: number | null;
    }
  >) {
    const a = r.on_user == null || r.on_user === '' ? null : r.on_user;
    const b = r.on_employment == null || r.on_employment === '' ? null : r.on_employment;
    const userResolves = r.user_parent != null;
    const employmentResolves = r.employment_parent != null;
    // Wrong either way: the two sides naming different employers, or a side
    // naming an empid nobody holds.
    if (a !== b || (a !== null && !userResolves) || (b !== null && !employmentResolves)) {
      drifted.push({
        ...r,
        on_user: a,
        on_employment: b,
        user_resolves: userResolves,
        employment_resolves: employmentResolves,
      });
    }
  }

  const checked = rows.length;

  if (!drifted.length) {
    console.log(`\n  ${checked} accounts checked. users.parent_id agrees with employements.\n`);
    await db.destroy();
    return;
  }

  const width = Math.max(...drifted.map((d) => d.fullname.length), 8);

  console.log(`\n  ${drifted.length} of ${checked} accounts need attention:\n`);
  console.log(
    `  ${pad('who', width)}  ${pad('users', 12)}  ${pad('employements', 12)}  what it means`,
  );

  for (const d of drifted) {
    // An empid nobody holds is reported before a disagreement: it is the
    // stronger fault, and copying one column over the other does not fix it.
    const meaning =
      d.on_employment !== null && !d.employment_resolves
        ? `no account holds empid "${d.on_employment}" — a renamed empid, or Laravel wrote a user id`
        : d.on_user !== null && !d.user_resolves
          ? `no account holds empid "${d.on_user}" — the column points at nobody`
          : d.on_employment == null
            ? 'no working employment — the column should be cleared'
            : d.on_user == null
              ? 'employed, but the column is empty'
              : 'the two name different employers';

    console.log(
      `  ${pad(d.fullname, width)}  ${pad(d.on_user ?? '—', 12)}  ${pad(
        d.on_employment ?? '—',
        12,
      )}  ${meaning}`,
    );
  }

  // Only the rows where the employment names an employer that exists. A parent
  // no account holds has to be decided by hand — copying it onto the user
  // spreads the fault rather than repairing it.
  const copyable = drifted.filter((d) => d.on_employment === null || d.employment_resolves);
  const unresolved = drifted.filter((d) => !copyable.includes(d));

  if (copyable.length) {
    console.log(
      '\n  `employements` is the record of employment, so it wins unless you know\n' +
        '  otherwise. To make the column match it:\n\n' +
        '    UPDATE users u\n' +
        '      LEFT JOIN employements e ON e.user_id = u.id AND e.is_working = \'1\'\n' +
        '       SET u.parent_id = e.parent_id\n' +
        '     WHERE u.id IN (' +
        copyable.map((d) => d.id).join(', ') +
        ');\n',
    );
  }

  if (unresolved.length) {
    console.log(
      '\n  These name an empid no account holds, so there is nothing to copy:\n\n' +
        unresolved.map((d) => `    ${d.id}  ${d.fullname}  "${d.on_employment}"`).join('\n') +
        '\n\n  Either the employer was renamed — give them that empid back, or move\n' +
        '  these people to the laboratory they actually work for — or Laravel wrote\n' +
        '  a user id, in which case the employer is the account with that id.\n',
    );
  }

  await db.destroy();
  process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await db.destroy();
  process.exit(1);
});
