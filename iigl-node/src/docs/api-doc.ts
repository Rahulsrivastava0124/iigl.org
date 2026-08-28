/**
 * Writes API.md, the human reference for the API.
 *
 *   npm run docs
 *
 * Generated from the OpenAPI document, so it cannot drift from the spec — and
 * check-spec.ts holds that spec against the routers, so it cannot drift from
 * the code either.
 */
import { writeFileSync } from 'node:fs';
import { openApiDocument } from './openapi.js';

type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: Array<{ name: string; in: string; description?: string; schema?: any; required?: boolean }>;
  requestBody?: { content?: Record<string, { schema?: any }>; required?: boolean };
  responses?: Record<string, { description?: string }>;
};

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

interface Row {
  tag: string;
  method: string;
  path: string;
  op: Operation;
}

const rows: Row[] = [];
for (const [path, operations] of Object.entries(openApiDocument.paths)) {
  for (const [method, op] of Object.entries(operations as Record<string, Operation>)) {
    rows.push({ tag: (op.tags ?? ['Other'])[0], method: method.toUpperCase(), path, op });
  }
}

const tags = (openApiDocument.tags ?? []).map((t: any) => t.name);
const tagOrder = new Map<string, number>(tags.map((t: string, i: number) => [t, i]));
const tagNote = new Map<string, string>(
  (openApiDocument.tags ?? []).map((t: any) => [t.name, t.description ?? '']),
);

rows.sort(
  (a, b) =>
    (tagOrder.get(a.tag) ?? 99) - (tagOrder.get(b.tag) ?? 99) ||
    a.path.localeCompare(b.path) ||
    METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method),
);

const isPublic = (op: Operation) => Array.isArray(op.security) && op.security.length === 0;

/** The body fields an endpoint accepts, from its request schema. */
function bodyFields(op: Operation): string {
  const schema =
    op.requestBody?.content?.['application/json']?.schema ??
    op.requestBody?.content?.['multipart/form-data']?.schema;
  if (!schema?.properties) return '';

  const required = new Set<string>(schema.required ?? []);
  const names = Object.keys(schema.properties);
  const shown = names.slice(0, 8).map((n) => (required.has(n) ? `**${n}**` : n));
  if (names.length > 8) shown.push(`+${names.length - 8} more`);
  return shown.join(', ');
}

function queryParams(op: Operation): string {
  const q = (op.parameters ?? []).filter((p) => p.in === 'query').map((p) => `\`${p.name}\``);
  return q.length ? q.join(', ') : '—';
}

/** Non-2xx responses, so the failure modes are visible without opening Swagger. */
function failures(op: Operation): string {
  const codes = Object.keys(op.responses ?? {})
    .filter((c) => Number(c) >= 400)
    .sort();
  return codes.length ? codes.join(', ') : '—';
}

const publicCount = rows.filter((r) => isPublic(r.op)).length;

const out: string[] = [];
const w = (line = '') => out.push(line);

w('# IIGL API');
w();
w(
  `${rows.length} endpoints. Generated from the OpenAPI document by \`npm run docs\` — do not edit by hand.`,
);
w();
w('The interactive version is at `/docs` when the server is running, and the raw');
w('document at `/openapi.json`.');
w();

// ------------------------------------------------------------------ preamble
w('## Getting a session');
w();
w('```http');
w('POST /api/auth/login');
w('Content-Type: application/json');
w();
w('{ "mobile": "9800000000", "password": "…" }');
w('```');
w();
w('The response sets an httpOnly cookie named `iigl.sid`. Send it with every');
w('subsequent request — `credentials: "include"` in the browser, `-b` with curl.');
w('Sessions last eight hours.');
w();
w('Passwords are the existing Laravel bcrypt hashes, so credentials carried over');
w('from the PHP application unchanged.');
w();
w('A number held by more than one account resolves by password: sign-in compares');
w('against every account on that number and picks the one it matches, rather than');
w('taking the lowest id. Three active staff were locked out by that in the old');
w('system.');
w();

w('## Roles');
w();
w('| `role_id` | Role | Sees |');
w('| --- | --- | --- |');
w('| 1 | Administrator | Everything, and the matrix does not restrict them |');
w('| 2 | Laboratory | Its own orders, certificates, staff and money |');
w('| 3, 4, 5 | Lab employee, manager, office boy | Their laboratory, narrowed by the permission matrix |');
w();
w('Staff guards test `role_id > 2`, so roles 4 and 5 are included. Do not hardcode');
w('`role_id === 3`.');
w();
w('Records are filtered to the caller’s laboratory. Requesting another');
w('laboratory’s record by id returns 403 rather than the row.');
w();
w('`role_permissions` narrows staff further. Without view and create on');
w('`product_collection`, a person sees only the orders they took or were assigned.');
w();

w('## Conventions');
w();
w('**Every response is wrapped.** A single record comes back as `{ "data": … }`;');
w('a list adds `meta`:');
w();
w('```json');
w('{');
w('  "data": [ … ],');
w('  "meta": { "page": 1, "per_page": 50, "total": 9608, "total_pages": 193 }');
w('}');
w('```');
w();
w('**Pagination** is `?page=` and `?per_page=`, one-indexed, capped per endpoint.');
w();
w('**Errors** are always the same shape, and the message is written for a person:');
w();
w('```json');
w('{ "error": "conflict", "message": "All 2 reports for this item have already been created." }');
w('```');
w();
w('| Status | `error` | Means |');
w('| --- | --- | --- |');
w('| 400 | `bad_request` | The request is wrong. The message says how. |');
w('| 401 | `unauthorized` | No session, or it expired. |');
w('| 403 | `forbidden` | Another laboratory’s record, or the role lacks access. |');
w('| 404 | `not_found` | No such record. |');
w('| 409 | `conflict` | The request is valid but the state forbids it. |');
w('| 429 | `too_many_requests` | Rate limited. Sign-in and verification logging only. |');
w('| 500 | `internal` | Our fault. The detail is in the server log, not the response. |');
w();
w('**A path id must be a positive whole number.** Anything else is a 400 before');
w('any query runs.');
w();
w('**Uploads are separate from saving.** `POST /api/uploads/{bucket}` returns a');
w('path; submit that path with the form it belongs to. An abandoned form leaves a');
w('file on disk and no record, which is the cheaper failure.');
w();
w('**PDFs stream inline** with `Content-Type: application/pdf`. Add `?format=html`');
w('to any card or document endpoint to get the markup instead — that is what to');
w('diff against the Laravel output when checking for visual drift.');
w();

// ------------------------------------------------------------------ endpoints
w('---');
w();
w('# Endpoints');
w();

let current = '';
for (const row of rows) {
  if (row.tag !== current) {
    current = row.tag;
    w();
    w(`## ${current}`);
    const note = tagNote.get(current);
    if (note) {
      w();
      w(note);
    }
    w();
    w('| Method | Path | Auth | Query | Body | Fails | Purpose |');
    w('| --- | --- | --- | --- | --- | --- | --- |');
  }

  const body = bodyFields(row.op);
  w(
    `| ${row.method} | \`${row.path}\` | ${isPublic(row.op) ? 'public' : 'session'} | ` +
      `${queryParams(row.op)} | ${body || '—'} | ${failures(row.op)} | ${row.op.summary ?? ''} |`,
  );
}

w();
w('---');
w();
w('Bold body fields are required.');
w();
w(
  `${rows.length} endpoints: ${publicCount} public, ${rows.length - publicCount} requiring a session.`,
);
w();

writeFileSync('API.md', out.join('\n'), 'utf8');
console.log(`API.md written: ${rows.length} endpoints, ${publicCount} public.`);
