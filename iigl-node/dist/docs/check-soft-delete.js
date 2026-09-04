/**
 * Every read of `orders` must exclude the deleted ones.
 *
 *   npm run check:soft-delete
 *
 * Deleting an order stamps `orders.deleted_at` and leaves the row (migration
 * 030). There are thirty query sites across ten files and the schema has no
 * foreign keys, so a read that forgets the filter does not fail — it quietly
 * puts a deleted order back into a list, a count or a sum, and nothing says so.
 * That is the whole reason this file exists: the mistake is invisible at
 * runtime, so it has to be caught here.
 *
 * The check is textual, which is crude and is the point: it needs no database
 * and it reads the way a person checking by hand would. A query on `orders` has
 * to carry one of `live(`, `liveJoined(`, `deleted_at`, or `scopeOrders(` — the
 * dashboard's own wrapper, which applies `live()` itself — within the statement
 * it belongs to, or within the comment above it.
 *
 * A read that genuinely wants the deleted rows says so with the marker
 * `soft-delete-exempt` in a comment, and says why. There is one: the
 * order-number clash check, because a number belonging to a deleted order is
 * still spent.
 *
 * Writes are exempt: an insert has nothing to filter, and an update naming a
 * row by its id is amending that row whatever its state.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Reaches `orders` as the table it reads from, or through a join. */
const TOUCHES_ORDERS = /(selectFrom\(\s*'orders'\s*\)|(?:inner|left|right)Join\(\s*'orders'\s*,)/;
/** Says, somewhere in the same statement, that it wants the live ones. */
const FILTERED = /(\blive\(|\bliveJoined\(|deleted_at|\bscopeOrders\(|soft-delete-exempt)/;
function walk(dir) {
    return readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory())
            return entry === 'docs' ? [] : walk(full);
        return full.endsWith('.ts') ? [full] : [];
    });
}
const offences = [];
for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8');
    if (!TOUCHES_ORDERS.test(source))
        continue;
    const lines = source.split('\n');
    lines.forEach((line, i) => {
        if (!TOUCHES_ORDERS.test(line))
            return;
        // The statement this query belongs to: back to the line that opened it,
        // forward to the one that ends it. A Kysely query is a chain over many
        // lines and the filter can sit on any of them.
        let start = i;
        while (start > 0 && !/(^|\s)(const|let|return|await|=>)\s|^\s*$/.test(lines[start]))
            start--;
        let end = i;
        while (end < lines.length - 1 && !/;\s*$/.test(lines[end]))
            end++;
        // The comment above a query is part of how it explains itself, so the
        // window reaches back past the opening line to take one in.
        const statement = lines.slice(Math.max(0, Math.min(start, i - 8)), end + 1).join('\n');
        if (FILTERED.test(statement))
            return;
        offences.push({
            file: path.relative(root, file).replace(/\\/g, '/'),
            line: i + 1,
            text: line.trim(),
        });
    });
}
if (offences.length === 0) {
    console.log('Every query on `orders` filters out the deleted ones.');
    process.exit(0);
}
console.error(`${offences.length} query/queries on \`orders\` do not exclude deleted rows:\n`);
for (const o of offences) {
    console.error(`  src/${o.file}:${o.line}`);
    console.error(`    ${o.text}`);
}
console.error('\nWrap the query in `live()` (or `liveJoined()` when `orders` came from a join),\n' +
    'both exported from src/services/order.service.ts.');
process.exit(1);
