/**
 * Writes API-ROUTES.md: the endpoint list and nothing else.
 *
 *   npm run routes
 *
 * Generated from the OpenAPI document, so it cannot drift from the spec, which
 * check-spec.ts in turn holds against the routers.
 */
import { writeFileSync } from 'node:fs';
import { openApiDocument } from './openapi.js';

interface Row {
  tag: string;
  method: string;
  path: string;
  auth: string;
  summary: string;
  params: string;
}

const METHOD_ORDER = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

const rows: Row[] = [];

for (const [path, operations] of Object.entries(openApiDocument.paths)) {
  for (const [method, op] of Object.entries(operations as Record<string, any>)) {
    const query = (op.parameters ?? [])
      .filter((p: any) => p.in === 'query')
      .map((p: any) => p.name);

    rows.push({
      tag: (op.tags ?? ['Other'])[0],
      method: method.toUpperCase(),
      path,
      // An empty security array on the operation means it overrides the
      // document-wide cookie requirement, i.e. it is public.
      auth: Array.isArray(op.security) && op.security.length === 0 ? 'public' : 'session',
      summary: op.summary ?? '',
      params: query.length ? query.map((q: string) => `\`${q}\``).join(', ') : '—',
    });
  }
}

const tags = (openApiDocument.tags ?? []).map((t: any) => t.name);
const tagOrder = new Map(tags.map((t: string, i: number) => [t, i]));

rows.sort(
  (a, b) =>
    (tagOrder.get(a.tag) ?? 99) - (tagOrder.get(b.tag) ?? 99) ||
    a.path.localeCompare(b.path) ||
    METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method),
);

const lines: string[] = [];
lines.push('# IIGL API — routes');
lines.push('');
lines.push(
  `${rows.length} endpoints. Generated from the OpenAPI document by \`npm run routes\` — do not edit by hand.`,
);
lines.push('');
lines.push(
  'Endpoints marked `public` need no session. Everything else requires the `iigl.sid` cookie from `POST /api/auth/login`.',
);
lines.push('');

let current = '';
for (const row of rows) {
  if (row.tag !== current) {
    current = row.tag;
    const description = (openApiDocument.tags ?? []).find((t: any) => t.name === current)?.description;
    lines.push('');
    lines.push(`## ${current}`);
    if (description) {
      lines.push('');
      lines.push(description);
    }
    lines.push('');
    lines.push('| Method | Path | Auth | Query | Purpose |');
    lines.push('| --- | --- | --- | --- | --- |');
  }
  lines.push(
    `| ${row.method} | \`${row.path}\` | ${row.auth} | ${row.params} | ${row.summary} |`,
  );
}

lines.push('');

const publicCount = rows.filter((r) => r.auth === 'public').length;
lines.push('---');
lines.push('');
lines.push(
  `${rows.length} endpoints: ${publicCount} public, ${rows.length - publicCount} requiring a session.`,
);
lines.push('');

writeFileSync('API-ROUTES.md', lines.join('\n'), 'utf8');
console.log(`API-ROUTES.md written: ${rows.length} endpoints, ${publicCount} public.`);
