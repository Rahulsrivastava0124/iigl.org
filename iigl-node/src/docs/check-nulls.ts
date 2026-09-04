/**
 * Is anything holding the word "null" where it should hold nothing?
 *
 *   npm run check:nulls
 *
 * `String(null)` is the four-character word "null", and a form that sends a
 * JSON null for an empty box used to write it as text. It reads back as the
 * word typed into the field — the Edit Employee form showed "null" in five
 * boxes — and where the column is a file path the panel then asks for a file
 * called `null` and renders a broken image on a record that never had one.
 *
 * Migrations 023 and 030 cleaned what existed. This is the standing version:
 * every text column of every table in the schema, so a column added next month
 * is covered without anybody remembering to add it to a list. "undefined" and
 * "NaN" are swept with it — the same accident, one type-coercion further on.
 *
 * Only the exact word as the whole value. An address on Null Lane is a real
 * address and is not reported.
 *
 * Read-only. It prints what it finds and the SQL that fixes it, because a
 * repair that runs unattended is how a wrong value gets written over a right
 * one.
 */
import { sql } from 'kysely';
import { db } from '../db/index.js';

const BAD = ['null', 'undefined', 'nan'];

const columns = await sql<{ TABLE_NAME: string; COLUMN_NAME: string }>`
  SELECT TABLE_NAME, COLUMN_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND DATA_TYPE IN ('varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext')
  ORDER BY TABLE_NAME, ORDINAL_POSITION
`.execute(db);

const found: { table: string; column: string; n: number }[] = [];

for (const c of columns.rows) {
  const table = sql.raw(`\`${c.TABLE_NAME}\``);
  const column = sql.raw(`\`${c.COLUMN_NAME}\``);
  const r = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM ${table} WHERE LOWER(TRIM(${column})) IN (${sql.join(BAD.map((b) => sql.lit(b)))})
  `.execute(db);
  const n = Number(r.rows[0]?.n ?? 0);
  if (n > 0) found.push({ table: c.TABLE_NAME, column: c.COLUMN_NAME, n });
}

console.log(`${columns.rows.length} text columns checked.\n`);

if (found.length === 0) {
  console.log('Nothing holds the word "null".');
} else {
  for (const f of found) console.log(`  ${f.table}.${f.column}`.padEnd(46), `${f.n} row${f.n === 1 ? '' : 's'}`);
  console.log('\nTo clear them:\n');
  for (const f of found) {
    console.log(
      `  UPDATE \`${f.table}\` SET \`${f.column}\` = NULL WHERE LOWER(TRIM(\`${f.column}\`)) IN ('null','undefined','nan');`,
    );
  }
  console.log('\nCheck each one first: a value that legitimately reads "null" is left to you.');
}

await db.destroy();
process.exit(found.length === 0 ? 0 : 1);
