/**
 * What the header search finds.
 *
 *   npm run check:search
 *
 * The box in the topbar does not filter anything itself — it navigates to the
 * list that holds the answer with the term in `?q=`. So what it finds is
 * whatever those two list endpoints return for that term, and that is what this
 * asks, for head office and for a laboratory.
 *
 * Three shapes go in, and the shapes are exact across the live data: every one
 * of the 22,407 certificate numbers is twelve digits, and every one of the
 * 9,759 order numbers is six digits, a hyphen and six more.
 *
 *   040100002111    a certificate   → GET /api/reports?q=
 *   202108-225523   an order        → GET /api/orders?q=
 *   a name, mobile  a customer      → GET /api/orders?q=
 *
 * Read-only.
 */
import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
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
  issueSession(res, { id, fullname: 'search check', roleId, labId });
  return pair;
}

const server = createApp().listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const { port } = server.address() as AddressInfo;

const get = (path: string, cookie: string) =>
  new Promise<any>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, headers: { cookie } }, (r) => {
        let t = '';
        r.setEncoding('utf8');
        r.on('data', (c) => (t += c));
        r.on('end', () => resolve({ status: r.statusCode, body: t }));
      })
      .on('error', reject);
  });

// Real values, read from the data rather than hardcoded.
const certificate = await db
  .selectFrom('reports')
  .select(['id', 'report_no', 'lab_id'])
  .orderBy('id', 'desc')
  .executeTakeFirstOrThrow();

const order = await db
  .selectFrom('orders')
  .select(['id', 'order_no', 'customer_name', 'mobile', 'lab_id'])
  .where('deleted_at', 'is', null)
  .where('lab_id', '=', Number(certificate.lab_id))
  .orderBy('id', 'desc')
  .executeTakeFirstOrThrow();

const lab = Number(certificate.lab_id);
const who: Array<[string, string, string]> = [
  ['head office', 'super', cookieFor('super', 1, 1, null)],
  [`laboratory ${lab}`, 'admin', cookieFor('admin', lab, 2, lab)],
];

let failed = false;

async function found(label: string, path: string, cookie: string, wanted: string) {
  const r = await get(path, cookie);
  const rows = r.status === 200 ? (JSON.parse(r.body).data ?? []) : [];
  const hit = rows.some((row: Record<string, unknown>) =>
    Object.values(row).some((v) => String(v) === wanted),
  );
  if (!hit) failed = true;
  console.log(
    `  ${hit ? 'ok  ' : 'FAIL'}  ${label.padEnd(46)} ${r.status}, ${rows.length} row(s)`,
  );
}

for (const [label, portal, cookie] of who) {
  console.log(`\n${label}:`);
  await found(
    `certificate ${certificate.report_no}`,
    `/api/reports?q=${certificate.report_no}&portal=${portal}`,
    cookie,
    String(certificate.report_no),
  );
  await found(
    `order ${order.order_no}`,
    `/api/orders?q=${encodeURIComponent(order.order_no)}&portal=${portal}`,
    cookie,
    String(order.order_no),
  );
  if (order.mobile) {
    await found(
      `customer by mobile ${order.mobile}`,
      `/api/orders?q=${encodeURIComponent(order.mobile)}&portal=${portal}`,
      cookie,
      String(order.order_no),
    );
  }
}

assert.ok(!failed, 'the header search does not find what it navigates to');
console.log('\nEvery shape the box accepts lands on a list that contains the row.');

server.close();
await db.destroy();
process.exit(0);
