// Temporary: exercises the permission rules against the real routes with
// signed session cookies. Only reads, and writes the API is expected to refuse.
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { db } from './db/index.js';

const cookie = (u: { id: number; fullname: string; roleId: number | null; labId: number | null }) => {
  const body = Buffer.from(JSON.stringify({ ...u, exp: Date.now() + 600_000 })).toString('base64url');
  const mac = createHmac('sha256', env.sessionSecret).update(body).digest('base64url');
  return `iigl.sid=${body}.${mac}`;
};

const SUPER = cookie({ id: 1, fullname: 'IIGL', roleId: 1, labId: null });
const LAB = cookie({ id: 26, fullname: 'Rahul Laboratory', roleId: 2, labId: 26 });
const LAB_STAFF = cookie({ id: 31, fullname: 'Rahul kumar EMP', roleId: 9, labId: 26 });
const HO_STAFF = cookie({ id: 25, fullname: 'Rahul test', roleId: 3, labId: 1 });

const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

let failed = 0;
async function check(name: string, who: string, method: string, path: string, expect: number, body?: unknown, inspect?: (j: any) => string | null) {
  const res = await fetch(base + path, {
    method,
    headers: { cookie: who, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  let problem = res.status === expect ? null : `expected ${expect}, got ${res.status} ${text.slice(0, 140)}`;
  if (!problem && inspect) problem = inspect(json);
  if (problem) failed++;
  console.log(`${problem ? 'FAIL' : 'ok  '}  ${name}${problem ? ' — ' + problem : ''}`);
}
const names = (j: any) => (j?.data ?? []).map((r: any) => r.action_type).join(',');

// --- an employee cannot grant or shape roles
await check('lab staff cannot read own permission screen', LAB_STAFF, 'GET', '/users/31/permissions', 403);
await check('lab staff cannot grant a colleague', LAB_STAFF, 'PUT', '/users/33/permissions', 403, { action_type: 'report', view: true });
await check('lab staff cannot create a role', LAB_STAFF, 'POST', '/roles', 403, { name: 'Escalate' });
await check('lab staff cannot grant their own role', LAB_STAFF, 'PUT', '/roles/9/permissions', 403, { action_type: 'report', view: true });

// --- lab staff limited to what Office Boy allows (orders view + add)
await check('lab staff: certificates refused', LAB_STAFF, 'GET', '/reports', 403);
await check('lab staff: certificate print refused', LAB_STAFF, 'GET', '/cards/data/1', 403);
await check('lab staff: customers refused', LAB_STAFF, 'GET', '/customers/accounts', 403);
await check('lab staff: own orders still readable', LAB_STAFF, 'GET', '/orders', 200);
await check('lab staff: head office enquiries refused', LAB_STAFF, 'GET', '/enquiries', 403);
await check('lab staff: deleting an order refused', LAB_STAFF, 'DELETE', '/orders/999999999', 403);
await check('lab staff: me/permissions masked to lab side', LAB_STAFF, 'GET', '/users/me/permissions', 200, undefined, (j) => {
  const granted = j.data.filter((r: any) => r.view || r.create || r.update || r.delete).map((r: any) => `${r.action_type}:${['view', 'create', 'update', 'delete'].filter((a) => r[a]).join('+')}`);
  return j.staff_of === 'laboratory' && granted.join() === 'product_collection:view+create' ? null : `staff_of=${j.staff_of} granted=${granted}`;
});

// --- the laboratory handles its own staff, laboratory permissions only
await check('lab reads its employee’s permissions (lab rows only)', LAB, 'GET', '/users/31/permissions', 200, undefined, (j) =>
  names(j) === 'product_collection,report,customer' || names(j).split(',').sort().join() === 'customer,product_collection,report' ? null : names(j));
await check('lab cannot read head office’s employee', LAB, 'GET', '/users/25/permissions', 403);
await check('lab cannot grant a head-office permission', LAB, 'PUT', '/users/31/permissions', 400, { action_type: 'laboratory', view: true });
await check('lab role shows lab rows only', LAB, 'GET', '/roles/9/permissions', 200, undefined, (j) =>
  names(j).split(',').sort().join() === 'customer,product_collection,report' ? null : names(j));
await check('lab role refuses a website permission', LAB, 'PUT', '/roles/9/permissions', 400, { action_type: 'website_home', view: true });
await check('lab cannot open website setup', LAB, 'GET', '/content/banners', 403);
await check('lab cannot change its own permissions', LAB, 'GET', '/users/26/permissions', 403);

// --- head office handles every employee
await check('super reads head-office employee (HO rows)', SUPER, 'GET', '/users/25/permissions', 200, undefined, (j) =>
  j.staff_of === 'head_office' && names(j).includes('laboratory') && !names(j).includes('product_collection') ? null : `${j.staff_of} ${names(j)}`);
await check('super reads a laboratory employee (lab rows)', SUPER, 'GET', '/users/31/permissions', 200, undefined, (j) =>
  j.staff_of === 'laboratory' && !names(j).includes('laboratory') ? null : `${j.staff_of} ${names(j)}`);
await check('super cannot set a laboratory’s permissions', SUPER, 'GET', '/users/26/permissions', 403);
await check('shared role Team carries both sides', SUPER, 'GET', '/roles/3/permissions', 200, undefined, (j) =>
  names(j).includes('product_collection') && names(j).includes('website_home') && !names(j).includes('account') ? null : names(j));
await check('flags a permission does not use are stored off (laboratory has view only)', SUPER, 'GET', '/users/25/permissions', 200, undefined, (j) => {
  const lab = j.data.find((r: any) => r.action_type === 'laboratory');
  return lab && lab.view && !lab.delete && lab.abilities.join() === 'view' ? null : JSON.stringify(lab);
});

// --- head office's employee: head-office screens by grant
await check('HO staff: laboratories (own grant view)', HO_STAFF, 'GET', '/users/laboratories', 200, undefined, (j) => (j.data.length >= 2 ? null : `only ${j.data.length}`));
await check('HO staff: laboratory page', HO_STAFF, 'GET', '/users/laboratories/26/detail', 200);
await check('HO staff: website banners (Team website_home view)', HO_STAFF, 'GET', '/content/banners', 200);
await check('HO staff: enquiry book (Team visitor_book)', HO_STAFF, 'GET', '/enquiries', 200);
await check('HO staff: student enquiries (Team website_enquiry)', HO_STAFF, 'GET', '/students/enquiries', 200);
await check('HO staff: students list stays Super Admin', HO_STAFF, 'GET', '/students', 403);
await check('HO staff: courses stay Super Admin', HO_STAFF, 'GET', '/courses', 403);
await check('HO staff: customers across the network (Team customer view)', HO_STAFF, 'GET', '/customers/accounts', 200, undefined, (j) =>
  (j.data ?? []).some((r: any) => r.account_id) ? null : 'no registered customers visible');
await check('HO staff: registering a customer refused (no add)', HO_STAFF, 'POST', '/customers/accounts', 403, { company_name: 'x' });
await check('HO staff: certificates are a laboratory permission', HO_STAFF, 'GET', '/reports', 403);
await check('HO staff: roles stay the employer’s', HO_STAFF, 'POST', '/roles', 403, { name: 'x' });
await check('HO staff: me/permissions says head office', HO_STAFF, 'GET', '/users/me/permissions', 200, undefined, (j) =>
  j.staff_of === 'head_office' && !j.data.find((r: any) => r.action_type === 'report').view ? null : JSON.stringify(j.staff_of));

// --- the employers themselves are unchanged
await check('super: certificates', SUPER, 'GET', '/reports', 200);
await check('lab: certificates', LAB, 'GET', '/reports', 200);
await check('lab: customers', LAB, 'GET', '/customers/accounts', 200);
await check('super: me/permissions includes attendance and message', SUPER, 'GET', '/users/me/permissions', 200, undefined, (j) =>
  j.data.some((r: any) => r.action_type === 'message' && r.create) ? null : 'missing');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
server.close();
await db.destroy();
process.exit(failed ? 1 : 0);
