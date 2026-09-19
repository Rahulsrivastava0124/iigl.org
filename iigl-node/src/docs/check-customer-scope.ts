/**
 * A customer who has been to two laboratories.
 *
 *   npm run check:customer-scope
 *
 * There is no customer table. A customer is a mobile number that orders have
 * been placed under, so "one customer" can be two laboratories' work — and in
 * the live data at least one is: 7004860601 ordered seven times at
 * IIGL-KOLKATTA and twice at IIGL-BRAHAMPUR.
 *
 * That is the shape where a scope bug hides. Each laboratory must see its own
 * orders under that number and none of the other's, while head office sees
 * both; a list keyed by a number rather than by a row is easy to write so that
 * it answers with everything the number ever did.
 *
 * The case is found in the data rather than hardcoded, so this keeps working
 * when the database is reloaded — and says so when no such customer exists.
 *
 * Read-only.
 */
import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
import { sql } from 'kysely';
import { createApp } from '../app.js';
import { issueSession } from '../lib/session.js';
import { db } from '../db/index.js';

function cookieFor(portal: string, id: number, roleId: number, labId: number | null) {
  let pair = '';
  const res = {
    req: { query: { portal }, headers: {} },
    cookie: (n: string, v: string) => {
      pair = `${n}=${encodeURIComponent(v)}`;
    },
  } as unknown as Response;
  issueSession(res, { id, fullname: 'scope check', roleId, labId });
  return pair;
}

/** A mobile number two laboratories have both taken orders under. */
const shared = await sql<{ mobile: string; labs: number; orders: number }>`
  select mobile, count(distinct lab_id) as labs, count(*) as orders
    from orders
   where deleted_at is null and mobile is not null and mobile <> ''
   group by mobile
  having labs > 1
   order by orders desc
   limit 1
`.execute(db);

const customer = shared.rows[0];
if (!customer) {
  console.log('No customer in this data has been to more than one laboratory; nothing to check.');
  await db.destroy();
  process.exit(0);
}

const perLab = await sql<{ lab_id: number; fullname: string; n: number }>`
  select o.lab_id, u.fullname, count(*) as n
    from orders o join users u on u.id = o.lab_id
   where o.deleted_at is null and o.mobile = ${customer.mobile}
   group by o.lab_id, u.fullname
   order by n desc
`.execute(db);

const server = createApp().listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const { port } = server.address() as AddressInfo;

const get = (path: string, cookie: string) =>
  new Promise<{ status: number; rows: any[] }>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, headers: { cookie } }, (r) => {
        let t = '';
        r.setEncoding('utf8');
        r.on('data', (c) => (t += c));
        r.on('end', () => {
          let rows: any[] = [];
          try {
            const body = JSON.parse(t);
            rows = body.data?.orders ?? body.data ?? [];
          } catch {
            rows = [];
          }
          resolve({ status: r.statusCode ?? 0, rows });
        });
      })
      .on('error', reject);
  });

console.log(`Customer ${customer.mobile}, ${customer.orders} orders across ${customer.labs} laboratories:`);
for (const l of perLab.rows) console.log(`  ${String(l.n).padStart(3)}  ${l.fullname} (lab ${l.lab_id})`);
console.log('');

let failed = false;
const expect = (label: string, got: number, want: number) => {
  const ok = got === want;
  if (!ok) failed = true;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(50)} ${got} (wanted ${want})`);
};

// Each laboratory sees its own share and nobody else's.
for (const l of perLab.rows) {
  const cookie = cookieFor('admin', Number(l.lab_id), 2, Number(l.lab_id));
  const r = await get(`/api/customers/${customer.mobile}/orders?portal=admin`, cookie);
  expect(`${l.fullname} sees its own orders only`, r.rows.length, Number(l.n));
}

// Head office sees the whole of it.
const r = await get(`/api/customers/${customer.mobile}/orders?portal=super`, cookieFor('super', 1, 1, null));
expect('head office sees every laboratory’s', r.rows.length, Number(customer.orders));

assert.ok(!failed, 'a customer page is not scoped to the laboratory reading it');
console.log('\nA customer is a number, and each laboratory sees only what it did under it.');

server.close();
await db.destroy();
process.exit(0);
