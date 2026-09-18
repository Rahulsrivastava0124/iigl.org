/**
 * How long the dashboard takes, and how much of that is the cache.
 *
 *   npm run check:dashboard
 *
 * The dashboard is the slowest screen in the panel and the first one everybody
 * opens, so it is the one worth a number rather than an impression. This starts
 * the API on a loopback port, mints its own session with the app's own signer —
 * no password is involved — and asks twice: cold, then warm.
 *
 * Head office is the case that hurts. A laboratory's figures are scoped to its
 * own rows; head office's are the network's, so every count runs over the whole
 * of `orders` and `reports`.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
import { createApp } from '../app.js';
import { issueSession } from '../lib/session.js';
import { cacheSize, invalidateDashboard } from '../services/dashboard-cache.js';
import { db } from '../db/index.js';

/** A signed cookie for a role, without going through the sign-in screen. */
function cookieFor(portal: string, id: number, roleId: number, labId: number | null) {
  let pair = '';
  const res = {
    req: { query: { portal }, headers: {} },
    cookie: (name: string, value: string) => {
      pair = `${name}=${encodeURIComponent(value)}`;
    },
  } as unknown as Response;
  issueSession(res, { id, fullname: 'timing', roleId, labId });
  return pair;
}

const server = createApp().listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const { port } = server.address() as AddressInfo;

/** The response body as text, for comparing two callers' answers. */
const body = (path: string, cookie: string) =>
  new Promise<string>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, headers: { cookie } }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve(text));
      })
      .on('error', reject);
  });

const hit = (path: string, cookie: string) =>
  new Promise<{ ms: number; status: number; bytes: number }>((resolve, reject) => {
    const started = Date.now();
    http
      .get({ host: '127.0.0.1', port, path, headers: { cookie } }, (res) => {
        let bytes = 0;
        res.on('data', (c) => (bytes += c.length));
        res.on('end', () =>
          resolve({ ms: Date.now() - started, status: res.statusCode ?? 0, bytes }),
        );
      })
      .on('error', reject);
  });

/*
  Three callers, because they run different queries. Head office counts the
  network; a laboratory counts itself and also builds the `lab` block, which
  joins certificates to order lines; an employee builds `mine` on top of that.

  Laboratory 4 is IIGL-KOLKATTA, the largest in this data at 9,474
  certificates — the slowest laboratory, which is the one worth timing.
*/
const callers: Array<[label: string, portal: string, cookie: string]> = [
  ['head office', 'super', cookieFor('super', 1, 1, null)],
  ['laboratory 4', 'admin', cookieFor('admin', 4, 2, 4)],
  ['staff of lab 4', 'team', cookieFor('team', 23, 3, 4)],
];

console.log('Dashboard timings. Cold is with the cache cleared; warm is the next call.\n');
console.log(`${'caller'.padEnd(16)} ${'endpoint'.padEnd(10)} ${'status'.padEnd(7)} ${'cold'.padEnd(10)} warm`);

for (const [label, portal, cookie] of callers) {
  for (const endpoint of ['summary', 'trend']) {
    const path = `/api/dashboard/${endpoint}?portal=${portal}`;
    invalidateDashboard();
    const cold = await hit(path, cookie);
    const warm = await hit(path, cookie);
    console.log(
      `${label.padEnd(16)} ${endpoint.padEnd(10)} ${String(cold.status).padEnd(7)} ${`${cold.ms} ms`.padEnd(10)} ${warm.ms} ms`,
    );
  }
}

/*
  The part of a cache that is worth a test.

  A laboratory and its own staff both have `labId` 4, so keying on the
  laboratory would give them one entry — and their answers differ: `lab` is the
  laboratory's block and `mine` is one employee's own orders and wallet. Asked
  in that order, with nothing cleared in between, the employee would be handed
  the laboratory's body and read its takings as their own.

  So they are asked back to back, warm on purpose, and the two bodies must not
  be the same.
*/
invalidateDashboard();

const [, , labCookie] = callers[1]!;
const [, , staffCookie] = callers[2]!;

const asLab = await body('/api/dashboard/summary?portal=admin', labCookie);
const asStaff = await body('/api/dashboard/summary?portal=team', staffCookie);

let failed = false;
if (asLab === asStaff) {
  console.error('\nFAIL: a laboratory and its staff were served the same cached dashboard.');
  failed = true;
} else {
  console.log('\nA laboratory and its staff keep separate entries.');
}

// And the same caller warm really is the held copy, not a rebuild that happens
// to agree: two calls with no write between them must be byte for byte equal.
const again = await body('/api/dashboard/summary?portal=admin', labCookie);
if (again !== asLab) {
  console.error('FAIL: the same caller was rebuilt rather than served from the cache.');
  failed = true;
} else {
  console.log('The same caller is served the held copy.');
}

// A write drops it. Nothing is written here — the map is cleared directly,
// which is what the middleware in app.ts does on any successful write.
invalidateDashboard();
if (cacheSize() !== 0) {
  console.error('FAIL: the cache still held entries after being invalidated.');
  failed = true;
} else {
  console.log('A write empties it.');
}

server.close();
await db.destroy();
process.exit(failed ? 1 : 0);
