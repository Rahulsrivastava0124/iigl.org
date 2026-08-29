/**
 * The migration runner.
 *
 *   npm run migrate            apply everything not yet applied
 *   npm run migrate -- --dry   print what would run, touch nothing
 *   npm run migrate:status     what is applied, what is pending
 *   npm run migrate -- --baseline
 *                              record every file as applied without running it
 *
 * This project used to apply migrations by hand, on the reasoning that a tool
 * which can diff a schema can also drop a table. That reasoning still holds —
 * so this is not that kind of tool. It cannot generate SQL, cannot compare a
 * schema to a model, and has no opinion about what the database should contain.
 * It reads the numbered files in `migrations/`, runs the ones that have not run
 * here yet, and writes down what it did.
 *
 * What by hand actually cost: nothing records which files have been applied to
 * which database, so a second environment is one forgotten file away from a
 * schema that is subtly different from this one — and the failure shows up as a
 * missing column at runtime rather than at deploy time.
 *
 * Three deliberate limits:
 *
 *   - **MySQL DDL does not roll back.** A file that fails halfway leaves the
 *     statements before the failure in place. The runner stops there, records
 *     nothing for that file, and prints the statement that failed so the rest
 *     can be finished or reversed by hand from the rollback comment every
 *     migration carries.
 *   - **A file that drops anything needs `--allow-drop`.** The statements are
 *     printed first. Dropping is a decision, not a side effect of running a
 *     command.
 *   - **An applied file is checksummed.** Editing a migration after it has run
 *     somewhere is how two databases end up believing they are the same. The
 *     runner refuses to continue and names the file.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../lib/env.js';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
/** A migration whose header says it is not ready to run. */
const SKIP_MARKER = '@blocked';
function read() {
    return readdirSync(DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((name) => {
        const sql = readFileSync(path.join(DIR, name), 'utf8');
        const blocked = sql.includes(SKIP_MARKER)
            ? (sql.match(new RegExp(`${SKIP_MARKER}\\s*(.*)`))?.[1]?.trim() ?? 'marked blocked')
            : null;
        // Only real statements, not the rollback comments at the bottom of every
        // file, which are the same words behind a `--`.
        const drops = statements(sql).filter((s) => /^\s*DROP\s/i.test(s));
        return {
            name,
            sql,
            checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16),
            blocked,
            drops,
        };
    });
}
/**
 * Splits a file into statements.
 *
 * Comment-aware, because every migration here is more comment than SQL and a
 * naive split on `;` would treat a semicolon inside a sentence as the end of a
 * statement. Nothing in these files uses a string literal containing `;` or a
 * routine body, so this does not try to handle either — it would be a parser
 * pretending to be a splitter.
 */
export function statements(sql) {
    const withoutComments = sql
        .split('\n')
        .map((line) => (line.trimStart().startsWith('--') ? '' : line))
        .join('\n');
    return withoutComments
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
}
async function connect() {
    const c = await mysql.createConnection(env.databaseUrl);
    await c.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name varchar(190) NOT NULL,
      checksum varchar(64) NOT NULL,
      statements int NOT NULL,
      applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
    return c;
}
async function applied(c) {
    const [rows] = await c.query('SELECT name, checksum FROM schema_migrations');
    return new Map(rows.map((r) => [r.name, r.checksum]));
}
const pad = (s, n) => s.padEnd(n);
async function main() {
    const args = process.argv.slice(2);
    const dry = args.includes('--dry') || args.includes('--dry-run');
    const baseline = args.includes('--baseline');
    const allowDrop = args.includes('--allow-drop');
    const statusOnly = args.includes('--status');
    const files = read();
    const c = await connect();
    const done = await applied(c);
    // An applied file that has changed since means two databases can no longer be
    // assumed to match. Nothing is run until that is settled.
    const changed = files.filter((f) => done.has(f.name) && done.get(f.name) !== f.checksum);
    if (changed.length) {
        console.error('\nApplied migrations have been edited since they ran here:\n');
        for (const f of changed)
            console.error(`  ${f.name}`);
        console.error('\nA migration is a record of what happened, not a document to revise. Add a new\n' +
            'file for the change, or — if it truly has not run anywhere else — delete the row\n' +
            `from schema_migrations and re-run.\n`);
        await c.end();
        process.exit(1);
    }
    const width = Math.max(...files.map((f) => f.name.length));
    if (statusOnly) {
        console.log('');
        for (const f of files) {
            const state = done.has(f.name) ? 'applied' : f.blocked ? 'blocked' : 'pending';
            const note = f.blocked && !done.has(f.name) ? `  ${f.blocked}` : '';
            console.log(`  ${pad(f.name, width)}  ${pad(state, 8)}${note}`);
        }
        console.log('');
        await c.end();
        return;
    }
    const pending = files.filter((f) => !done.has(f.name));
    if (baseline) {
        for (const f of pending) {
            if (f.blocked)
                continue;
            await c.query('INSERT INTO schema_migrations (name, checksum, statements) VALUES (?, ?, ?)', [f.name, f.checksum, statements(f.sql).length]);
            console.log(`  recorded ${f.name} without running it`);
        }
        console.log('\nBaselined. Use this only on a database that already has these changes.\n');
        await c.end();
        return;
    }
    const runnable = pending.filter((f) => !f.blocked);
    for (const f of pending.filter((f) => f.blocked)) {
        console.log(`  skipping ${pad(f.name, width)}  ${f.blocked}`);
    }
    if (!runnable.length) {
        console.log('\nNothing to apply.\n');
        await c.end();
        return;
    }
    const dropping = runnable.filter((f) => f.drops.length);
    if (dropping.length && !allowDrop && !dry) {
        console.error('\nThese migrations drop things:\n');
        for (const f of dropping) {
            for (const s of f.drops)
                console.error(`  ${f.name}: ${s}`);
        }
        console.error('\nRe-run with --allow-drop if that is what you want.\n');
        await c.end();
        process.exit(1);
    }
    for (const f of runnable) {
        const parts = statements(f.sql);
        if (dry) {
            console.log(`\n  ${f.name} — ${parts.length} statements`);
            for (const s of parts)
                console.log(`    ${s.replace(/\s+/g, ' ').slice(0, 100)}`);
            continue;
        }
        process.stdout.write(`  ${pad(f.name, width)}  `);
        for (const [i, statement] of parts.entries()) {
            try {
                await c.query(statement);
            }
            catch (err) {
                // DDL does not roll back, so what ran stays. Say exactly where it
                // stopped rather than leaving somebody to guess.
                console.log('failed');
                console.error(`\n  statement ${i + 1} of ${parts.length}:\n    ${statement}\n`);
                console.error(`  ${err.message}\n`);
                console.error(`  Statements 1 to ${i} were applied and are still in place. ${f.name} is not\n` +
                    '  recorded as applied. Finish it or reverse it by hand — the rollback is in a\n' +
                    '  comment at the bottom of the file.\n');
                await c.end();
                process.exit(1);
            }
        }
        await c.query('INSERT INTO schema_migrations (name, checksum, statements) VALUES (?, ?, ?)', [
            f.name,
            f.checksum,
            parts.length,
        ]);
        console.log(`applied  ${parts.length} statements`);
    }
    console.log(dry ? '\nDry run. Nothing was applied.\n' : '\nDone.\n');
    await c.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
