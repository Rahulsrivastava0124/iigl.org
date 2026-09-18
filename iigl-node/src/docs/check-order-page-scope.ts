/**
 * Whose order page is it?
 *
 *   npm run check:order-scope
 *
 * An order is the counter's record of one visit and belongs to the laboratory
 * that took it. Head office reads every list the order appears on and opens
 * none of them; a laboratory opens its own and not another's.
 *
 * That is three rules, and the third is the one a change to the first two
 * breaks by accident — closing a page for role 1 is easy to write in a way that
 * also closes it for the laboratory whose page it is. So all three are asserted
 * here, against the live data, with a real session each.
 *
 * Read-only: every request is a GET.
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
    cookie: (name: string, value: string) => {
      pair = `${name}=${encodeURIComponent(value)}`;
    },
  } as unknown as Response;
  issueSession(res, { id, fullname: 'scope check', roleId, labId });
  return pair;
}

const server = createApp().listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const { port } = server.address() as AddressInfo;

const status = (path: string, cookie: string) =>
  new Promise<number>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, headers: { cookie } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on('error', reject);
  });

// A real order, and the laboratory that took it. Picked from the data rather
// than hardcoded: ids move when the database is reloaded.
const order = await db
  .selectFrom('orders')
  .select(['id', 'lab_id'])
  .where('deleted_at', 'is', null)
  .orderBy('id', 'desc')
  .executeTakeFirstOrThrow();

const mine = Number(order.lab_id);
const someoneElse = await db
  .selectFrom('orders')
  .select(['id', 'lab_id'])
  .where('deleted_at', 'is', null)
  .where('lab_id', '!=', mine)
  .executeTakeFirstOrThrow();

const headOffice = cookieFor('super', 1, 1, null);
const laboratory = cookieFor('admin', mine, 2, mine);

let failed = false;
const check = async (what: string, path: string, cookie: string, want: number) => {
  const got = await status(path, cookie);
  const ok = got === want;
  if (!ok) failed = true;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what.padEnd(52)} ${got} (wanted ${want})`);
};

console.log(`Order ${order.id} belongs to laboratory ${mine}.\n`);

await check('head office: the order list', '/api/orders?portal=super', headOffice, 200);
await check(`head office: order ${order.id}`, `/api/orders/${order.id}?portal=super`, headOffice, 403);
await check(`head office: its price quote`, `/api/orders/${order.id}/quote?portal=super`, headOffice, 403);
await check(`head office: its printed receipt`, `/api/cards/order/receipt/${order.id}?portal=super`, headOffice, 200);

await check(`the laboratory: its own order ${order.id}`, `/api/orders/${order.id}?portal=admin`, laboratory, 200);
await check(`the laboratory: its own quote`, `/api/orders/${order.id}/quote?portal=admin`, laboratory, 200);
await check(
  `the laboratory: order ${someoneElse.id}, another laboratory's`,
  `/api/orders/${someoneElse.id}?portal=admin`,
  laboratory,
  403,
);

assert.ok(!failed, 'the order page is not scoped the way it is documented');
console.log('\nHead office reads the lists and the receipts; the page itself is the laboratory’s.');

server.close();
await db.destroy();
process.exit(0);
