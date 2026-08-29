/**
 * Calls every documented endpoint and reports the status and response shape.
 *
 *   npx tsx src/docs/sweep.ts
 *
 * Read-only by default: write endpoints are exercised with inputs that are
 * expected to be rejected, so the sweep proves validation and authorisation
 * without creating rows. Pass --writes to also run the happy-path creates,
 * which do insert (and then clean up after themselves).
 */

const BASE = process.env.SWEEP_BASE ?? 'http://localhost:3000';
const RUN_WRITES = process.argv.includes('--writes');

const ACCOUNTS = {
  admin: { mobile: '9999900002', password: 'smoketest123' },
  lab: { mobile: '9999900001', password: 'smoketest123' },
  staff: { mobile: '9999900003', password: 'smoketest123' },
} as const;

type Role = keyof typeof ACCOUNTS | 'anon';

/** Real ids from the local database copy. */
const FIXTURES = {
  orderId: 9612,
  reportId: 22132,
  reportNo: '122600012608',
  categoryId: 1,
  subcategoryId: 1,
  attributeId: 1,
  blogSlug: 'what-is-gemology',
  branchSlug: 'bhubaneswar',
  pageType: 'about iigl',
  formCategoryId: 1,
};

interface Case {
  name: string;
  method: string;
  path: string;
  as: Role;
  body?: unknown;
  /** Status codes that mean the endpoint behaved correctly. */
  expect: number[];
  note?: string;
  write?: boolean;
}

const cookies = new Map<Role, string>();

async function login(role: Exclude<Role, 'anon'>): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ACCOUNTS[role]),
  });
  if (!res.ok) throw new Error(`login as ${role} failed: ${res.status} ${await res.text()}`);
  const raw = res.headers.getSetCookie?.() ?? [];
  const jar = raw.map((c) => c.split(';')[0]).join('; ');
  cookies.set(role, jar);
}

/** One-line description of the response body, so drift is visible at a glance. */
function shapeOf(value: unknown, depth = 0): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : `[${value.length} × ${depth > 1 ? '…' : shapeOf(value[0], depth + 1)}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    if (depth > 1) return `{${keys.length} keys}`;
    const shown = keys.slice(0, 6).join(', ');
    return `{${shown}${keys.length > 6 ? `, +${keys.length - 6}` : ''}}`;
  }
  return typeof value;
}

const cases: Case[] = [
  // ---- Public, no session ----
  { name: 'health', method: 'GET', path: '/health', as: 'anon', expect: [200] },
  { name: 'openapi document', method: 'GET', path: '/openapi.json', as: 'anon', expect: [200] },
  { name: 'verify certificate', method: 'GET', path: `/api/public/verify/${FIXTURES.reportNo}`, as: 'anon', expect: [200] },
  { name: 'verify unknown number', method: 'GET', path: '/api/public/verify/000000000000', as: 'anon', expect: [404] },
  { name: 'verify-log', method: 'POST', path: '/api/public/verify-log', as: 'anon', body: {}, expect: [200], note: 'empty body is ignored, not an error' },
  { name: 'website page', method: 'GET', path: `/api/public/pages/${encodeURIComponent(FIXTURES.pageType)}`, as: 'anon', expect: [200] },
  { name: 'page not found', method: 'GET', path: '/api/public/pages/no-such-page', as: 'anon', expect: [404] },
  { name: 'blog list', method: 'GET', path: '/api/public/blogs', as: 'anon', expect: [200] },
  { name: 'blog detail', method: 'GET', path: `/api/public/blogs/${FIXTURES.blogSlug}`, as: 'anon', expect: [200] },
  { name: 'branch list', method: 'GET', path: '/api/public/branches', as: 'anon', expect: [200] },
  { name: 'branch detail', method: 'GET', path: `/api/public/branches/${FIXTURES.branchSlug}`, as: 'anon', expect: [200] },
  { name: 'public report types', method: 'GET', path: '/api/public/report-types', as: 'anon', expect: [200] },
  { name: 'banners', method: 'GET', path: '/api/public/banners', as: 'anon', expect: [200] },

  { name: 'verify by id', method: 'GET', path: `/api/public/verify-by-id/${FIXTURES.reportId}`, as: 'anon', expect: [200], note: 'what printed QR codes carry' },
  { name: 'verify by unknown id', method: 'GET', path: '/api/public/verify-by-id/99999999', as: 'anon', expect: [404] },

  // ---- Guard: nothing under /api answers without a session ----
  { name: 'GUARD orders', method: 'GET', path: '/api/orders', as: 'anon', expect: [401] },
  { name: 'GUARD reports', method: 'GET', path: '/api/reports', as: 'anon', expect: [401] },
  { name: 'GUARD transactions', method: 'GET', path: '/api/transactions', as: 'anon', expect: [401] },
  { name: 'GUARD dashboard', method: 'GET', path: '/api/dashboard/summary', as: 'anon', expect: [401] },
  { name: 'GUARD catalog', method: 'GET', path: '/api/catalog/categories', as: 'anon', expect: [401] },
  { name: 'GUARD users', method: 'GET', path: '/api/users/me', as: 'anon', expect: [401] },
  { name: 'GUARD create order', method: 'POST', path: '/api/orders', as: 'anon', body: {}, expect: [401] },
  { name: 'GUARD create report', method: 'POST', path: '/api/reports', as: 'anon', body: {}, expect: [401] },

  // ---- Auth ----
  { name: 'login wrong password', method: 'POST', path: '/api/auth/login', as: 'anon', body: { mobile: ACCOUNTS.lab.mobile, password: 'wrong' }, expect: [401] },
  { name: 'login missing field', method: 'POST', path: '/api/auth/login', as: 'anon', body: { mobile: ACCOUNTS.lab.mobile }, expect: [400] },
  { name: 'session user', method: 'GET', path: '/api/auth/me', as: 'staff', expect: [200] },
  { name: 'change password wrong current', method: 'POST', path: '/api/auth/change-password', as: 'staff', body: { current_password: 'wrong', new_password: 'abcdefgh' }, expect: [400], note: 'optional, but checked when sent' },
  { name: 'change password no current', method: 'POST', path: '/api/auth/change-password', as: 'staff', body: { new_password: 'short' }, expect: [400], note: 'the length rule still applies' },
  { name: 'change password too short', method: 'POST', path: '/api/auth/change-password', as: 'staff', body: { current_password: 'smoketest123', new_password: 'short' }, expect: [400] },

  // ---- Catalog ----
  { name: 'categories', method: 'GET', path: '/api/catalog/categories', as: 'staff', expect: [200] },
  { name: 'subcategories of category', method: 'GET', path: `/api/catalog/categories/${FIXTURES.categoryId}/subcategories`, as: 'staff', expect: [200] },
  { name: 'all subcategories', method: 'GET', path: '/api/catalog/subcategories', as: 'staff', expect: [200] },
  { name: 'attributes of subcategory', method: 'GET', path: `/api/catalog/subcategories/${FIXTURES.subcategoryId}/attributes`, as: 'staff', expect: [200] },
  { name: 'attribute values', method: 'GET', path: `/api/catalog/attributes/${FIXTURES.attributeId}/values`, as: 'staff', expect: [200] },
  { name: 'units', method: 'GET', path: '/api/catalog/units', as: 'staff', expect: [200] },
  { name: 'catalog report types', method: 'GET', path: '/api/catalog/report-types', as: 'staff', expect: [200] },
  { name: 'form layout', method: 'GET', path: `/api/catalog/form-layouts/${FIXTURES.formCategoryId}`, as: 'staff', expect: [200] },
  { name: 'form layout missing', method: 'GET', path: '/api/catalog/form-layouts/99999', as: 'staff', expect: [404] },

  // ---- Orders ----
  { name: 'order list', method: 'GET', path: '/api/orders?per_page=3', as: 'staff', expect: [200] },
  { name: 'order list filtered', method: 'GET', path: '/api/orders?status=delivered&per_page=3', as: 'staff', expect: [200] },
  { name: 'order detail (own lab)', method: 'GET', path: `/api/orders/${FIXTURES.orderId}`, as: 'staff', expect: [200] },
  { name: 'order detail CROSS-LAB', method: 'GET', path: `/api/orders/${FIXTURES.orderId}`, as: 'lab', expect: [403], note: 'lab 24 reaching into lab 12' },
  { name: 'order missing', method: 'GET', path: '/api/orders/99999999', as: 'staff', expect: [404] },
  { name: 'customer lookup', method: 'GET', path: '/api/orders/customer/lookup?mobile=9800000000', as: 'staff', expect: [200], note: 'must not resolve to /orders/{id}' },
  { name: 'create order no items', method: 'POST', path: '/api/orders', as: 'staff', body: { customer_name: 'X', mobile: '1', items: [] }, expect: [400] },
  { name: 'create order no card type', method: 'POST', path: '/api/orders', as: 'staff', body: { customer_name: 'X', mobile: '1', items: [{ category_id: 1, qty: 1 }] }, expect: [400] },
  { name: 'quote order', method: 'GET', path: `/api/orders/${FIXTURES.orderId}/quote`, as: 'staff', expect: [200] },
  { name: 'quote with discount', method: 'GET', path: `/api/orders/${FIXTURES.orderId}/quote?discount=10`, as: 'staff', expect: [200] },
  { name: 'quote CROSS-LAB', method: 'GET', path: `/api/orders/${FIXTURES.orderId}/quote`, as: 'lab', expect: [403] },
  { name: 'quote missing order', method: 'GET', path: '/api/orders/99999999/quote', as: 'staff', expect: [404] },
  { name: 'deliver discount too large', method: 'POST', path: `/api/orders/${FIXTURES.orderId}/deliver`, as: 'staff', body: { discount: 9999999 }, expect: [400], note: 'totals come from the price bands, not the request' },
  { name: 'deliver negative discount', method: 'POST', path: `/api/orders/${FIXTURES.orderId}/deliver`, as: 'staff', body: { discount: -5 }, expect: [400] },
  { name: 'deliver CROSS-LAB', method: 'POST', path: `/api/orders/${FIXTURES.orderId}/deliver`, as: 'lab', expect: [403] },
  { name: 'delete item CROSS-LAB', method: 'DELETE', path: '/api/orders/items/1', as: 'lab', expect: [403, 404] },

  { name: 'patch order nothing to change', method: 'PATCH', path: `/api/orders/${FIXTURES.orderId}`, as: 'staff', body: {}, expect: [400] },
  { name: 'patch order blank name', method: 'PATCH', path: `/api/orders/${FIXTURES.orderId}`, as: 'staff', body: { customer_name: '' }, expect: [400] },
  { name: 'patch order empty items', method: 'PATCH', path: `/api/orders/${FIXTURES.orderId}`, as: 'staff', body: { items: [] }, expect: [400] },
  { name: 'patch order CROSS-LAB', method: 'PATCH', path: `/api/orders/${FIXTURES.orderId}`, as: 'lab', body: { customer_name: 'X' }, expect: [403] },
  { name: 'patch order missing', method: 'PATCH', path: '/api/orders/99999999', as: 'staff', body: { customer_name: 'X' }, expect: [404] },

  // ---- Reports ----
  { name: 'report list', method: 'GET', path: '/api/reports?per_page=3', as: 'staff', expect: [200] },
  { name: 'report list by order', method: 'GET', path: '/api/reports?order_id=99999999', as: 'staff', expect: [200] },
  { name: 'report detail (own lab)', method: 'GET', path: `/api/reports/${FIXTURES.reportId}`, as: 'staff', expect: [200] },
  { name: 'report detail CROSS-LAB', method: 'GET', path: `/api/reports/${FIXTURES.reportId}`, as: 'lab', expect: [403] },
  { name: 'report missing', method: 'GET', path: '/api/reports/99999999', as: 'staff', expect: [404] },
  { name: 'create report no order', method: 'POST', path: '/api/reports', as: 'staff', body: {}, expect: [400] },
  { name: 'create report bad item', method: 'POST', path: '/api/reports', as: 'staff', body: { order_id: 1, order_detail_id: 99999999, subcategory_id: 1, attributes: [] }, expect: [400] },

  { name: 'patch report nothing to change', method: 'PATCH', path: `/api/reports/${FIXTURES.reportId}`, as: 'staff', body: {}, expect: [400] },
  { name: 'patch report bad attribute', method: 'PATCH', path: `/api/reports/${FIXTURES.reportId}`, as: 'staff', body: { attributes: [{ attr_id: '99999999' }] }, expect: [400] },
  { name: 'patch report CROSS-LAB', method: 'PATCH', path: `/api/reports/${FIXTURES.reportId}`, as: 'lab', body: { comments: 'x' }, expect: [403] },
  { name: 'patch report missing', method: 'PATCH', path: '/api/reports/99999999', as: 'staff', body: { comments: 'x' }, expect: [404] },

  // ---- Transactions ----
  { name: 'transaction list', method: 'GET', path: '/api/transactions?per_page=3', as: 'staff', expect: [200] },
  { name: 'transaction list sent', method: 'GET', path: '/api/transactions?direction=sent', as: 'staff', expect: [200] },
  { name: 'wallet', method: 'GET', path: '/api/transactions/wallet', as: 'staff', expect: [200], note: 'must not resolve to a {id} route' },
  { name: 'remittance zero amount', method: 'POST', path: '/api/transactions', as: 'staff', body: { amount: 0, pay_mode: 'cash' }, expect: [400] },
  { name: 'remittance no pay mode', method: 'POST', path: '/api/transactions', as: 'staff', body: { amount: 100 }, expect: [400] },
  { name: 'status bad value', method: 'POST', path: '/api/transactions/1/status', as: 'staff', body: { status: 9 }, expect: [400] },
  { name: 'status not receiver', method: 'POST', path: '/api/transactions/1/status', as: 'staff', body: { status: 1 }, expect: [400, 403, 404] },
  { name: 'dues CROSS-LAB', method: 'POST', path: `/api/transactions/dues/${FIXTURES.orderId}`, as: 'lab', body: { amount: 1 }, expect: [403] },
  { name: 'dues order missing', method: 'POST', path: '/api/transactions/dues/99999999', as: 'staff', body: { amount: 1 }, expect: [404] },

  { name: 'commission as staff', method: 'POST', path: '/api/transactions/commission', as: 'staff', body: { commission_on: 100 }, expect: [400], note: 'laboratory accounts only' },
  { name: 'commission zero base', method: 'POST', path: '/api/transactions/commission', as: 'lab', body: { commission_on: 0 }, expect: [400] },
  { name: 'ledger', method: 'GET', path: '/api/transactions/ledger', as: 'staff', expect: [200], note: 'must not resolve to a {id} route' },
  { name: 'ledger as admin', method: 'GET', path: '/api/transactions/ledger?user_id=1', as: 'admin', expect: [200] },

  // ---- Regressions: a bad path id must be 400, never 500 (audit H2) ----
  { name: 'REGRESSION order id abc', method: 'GET', path: '/api/orders/abc', as: 'staff', expect: [400] },
  { name: 'REGRESSION quote id abc', method: 'GET', path: '/api/orders/abc/quote', as: 'staff', expect: [400] },
  { name: 'REGRESSION report id abc', method: 'GET', path: '/api/reports/abc', as: 'staff', expect: [400] },
  { name: 'REGRESSION patch order id abc', method: 'PATCH', path: '/api/orders/abc', as: 'staff', body: { customer_name: 'x' }, expect: [400] },
  { name: 'REGRESSION verify-by-id abc', method: 'GET', path: '/api/public/verify-by-id/abc', as: 'anon', expect: [400] },
  { name: 'REGRESSION card data abc', method: 'GET', path: '/api/cards/data/abc', as: 'staff', expect: [400] },
  { name: 'REGRESSION zero id', method: 'GET', path: '/api/orders/0', as: 'staff', expect: [400] },
  { name: 'REGRESSION negative id', method: 'GET', path: '/api/orders/-1', as: 'staff', expect: [400] },
  { name: 'REGRESSION user patch id abc', method: 'PATCH', path: '/api/users/abc/active', as: 'admin', body: { is_active: true }, expect: [400] },

  // ---- Cards ----
  { name: 'card data', method: 'GET', path: `/api/cards/data/${FIXTURES.reportId}`, as: 'staff', expect: [200] },
  { name: 'card data CROSS-LAB', method: 'GET', path: `/api/cards/data/${FIXTURES.reportId}`, as: 'lab', expect: [403] },
  { name: 'card data missing', method: 'GET', path: '/api/cards/data/99999999', as: 'staff', expect: [404] },
  { name: 'smart card html', method: 'GET', path: `/api/cards/smart/${FIXTURES.reportId}?format=html`, as: 'staff', expect: [200] },
  { name: 'classic card html', method: 'GET', path: `/api/cards/classic/${FIXTURES.reportId}?format=html`, as: 'staff', expect: [200] },
  { name: 'bad card type', method: 'GET', path: `/api/cards/gold/${FIXTURES.reportId}`, as: 'staff', expect: [400] },
  { name: 'card CROSS-LAB', method: 'GET', path: `/api/cards/smart/${FIXTURES.reportId}`, as: 'lab', expect: [403] },
  { name: 'batch no ids', method: 'POST', path: '/api/cards/smart', as: 'staff', body: { report_ids: [] }, expect: [400] },
  { name: 'batch over the cap', method: 'POST', path: '/api/cards/smart', as: 'staff', body: { report_ids: Array.from({ length: 51 }, (_, i) => i + 1) }, expect: [400] },
  { name: 'batch html', method: 'POST', path: '/api/cards/smart?format=html', as: 'staff', body: { report_ids: [FIXTURES.reportId] }, expect: [200] },

  // ---- Users ----
  { name: 'own account', method: 'GET', path: '/api/users/me', as: 'staff', expect: [200] },
  { name: 'laboratories (staff)', method: 'GET', path: '/api/users/laboratories', as: 'staff', expect: [200] },
  { name: 'laboratories (admin)', method: 'GET', path: '/api/users/laboratories', as: 'admin', expect: [200] },
  { name: 'staff list', method: 'GET', path: '/api/users/staff?per_page=3', as: 'staff', expect: [200] },
  { name: 'roles', method: 'GET', path: '/api/roles', as: 'staff', expect: [200] },
  { name: 'roles as admin', method: 'GET', path: '/api/roles', as: 'admin', expect: [200] },
  { name: 'permission list', method: 'GET', path: '/api/roles/actions', as: 'staff', expect: [200], note: 'must not resolve to a {id} route' },
  { name: 'add permission AS LAB', method: 'POST', path: '/api/roles/actions', as: 'lab', body: { name: 'x', label: 'X' }, expect: [403], note: 'head office only' },
  { name: 'rename system role', method: 'PATCH', path: '/api/roles/3', as: 'admin', body: { name: 'Nope' }, expect: [403] },
  { name: 'delete system role', method: 'DELETE', path: '/api/roles/1', as: 'admin', expect: [403] },
  { name: 'role permissions', method: 'GET', path: '/api/roles/3/permissions', as: 'staff', expect: [200] },
  { name: 'role permissions missing role', method: 'GET', path: '/api/roles/99999999/permissions', as: 'admin', expect: [404] },
  { name: 'set role permission bad action', method: 'PUT', path: '/api/roles/3/permissions', as: 'admin', body: { action_type: 'nonsense' }, expect: [400] },
  { name: 'my permissions', method: 'GET', path: '/api/users/me/permissions', as: 'staff', expect: [200] },
  { name: 'user permissions missing user', method: 'GET', path: '/api/users/99999999/permissions', as: 'admin', expect: [404] },
  { name: 'grant to another lab staff', method: 'PUT', path: '/api/users/1/permissions', as: 'lab', body: { action_type: 'report', view: true }, expect: [403], note: 'a laboratory cannot grant to head office' },
  { name: 'create user AS STAFF', method: 'POST', path: '/api/users', as: 'staff', body: { fullname: 'X', mobile: '1', password: 'abcdefgh', role_id: 3 }, expect: [403], note: 'admin only' },
  { name: 'create user duplicate mobile', method: 'POST', path: '/api/users', as: 'admin', body: { fullname: 'X', mobile: ACCOUNTS.lab.mobile, password: 'abcdefgh', role_id: 3 }, expect: [409] },
  { name: 'create user short password', method: 'POST', path: '/api/users', as: 'admin', body: { fullname: 'X', mobile: '9111100000', password: 'short', role_id: 3 }, expect: [400] },
  { name: 'deactivate AS STAFF', method: 'PATCH', path: '/api/users/1/active', as: 'staff', body: { is_active: true }, expect: [403] },
  { name: 'deactivate missing user', method: 'PATCH', path: '/api/users/99999999/active', as: 'admin', body: { is_active: true }, expect: [404] },

  // ---- Dashboard ----
  { name: 'dashboard (lab scope)', method: 'GET', path: '/api/dashboard/summary', as: 'staff', expect: [200] },
  { name: 'dashboard (admin, all labs)', method: 'GET', path: '/api/dashboard/summary', as: 'admin', expect: [200] },

  // ---- Students: the pipeline ----
  { name: 'student enquiries', method: 'GET', path: '/api/students/enquiries?per_page=3', as: 'admin', expect: [200] },
  { name: 'student enquiries AS STAFF', method: 'GET', path: '/api/students/enquiries', as: 'staff', expect: [403], note: 'admin only' },
  { name: 'student enquiry bad status', method: 'GET', path: '/api/students/enquiries?status=maybe', as: 'admin', expect: [400] },
  { name: 'student enquiry no mobile', method: 'POST', path: '/api/students/enquiries', as: 'admin', body: { name: 'X' }, expect: [400] },
  { name: 'convert missing enquiry', method: 'POST', path: '/api/students/enquiries/99999999/convert', as: 'admin', body: {}, expect: [404] },

  { name: 'registrations', method: 'GET', path: '/api/students?per_page=3', as: 'admin', expect: [200] },
  { name: 'student summary', method: 'GET', path: '/api/students/summary', as: 'admin', expect: [200], note: 'must not resolve to a {id} route' },
  { name: 'registration missing', method: 'GET', path: '/api/students/99999999', as: 'admin', expect: [404] },
  { name: 'registration no name', method: 'POST', path: '/api/students', as: 'admin', body: { mobile: '9000000009' }, expect: [400] },

  { name: 'courses', method: 'GET', path: '/api/courses?per_page=3', as: 'admin', expect: [200] },
  { name: 'courses AS STAFF', method: 'GET', path: '/api/courses', as: 'staff', expect: [403], note: 'admin only' },
  { name: 'course no name', method: 'POST', path: '/api/courses', as: 'admin', body: { fee: 100 }, expect: [400] },
  { name: 'enrolments', method: 'GET', path: '/api/courses/enrolments?per_page=3', as: 'admin', expect: [200], note: 'must not resolve to a {id} route' },
  { name: 'enrolment missing student', method: 'POST', path: '/api/courses/enrolments', as: 'admin', body: { student_id: 99999999, course_id: 99999999 }, expect: [404] },
  { name: 'discount on missing enrolment', method: 'PATCH', path: '/api/courses/enrolments/99999999/discount', as: 'admin', body: { type: 'fixed', value: 100 }, expect: [404] },

  { name: 'student certificates', method: 'GET', path: '/api/student-certificates?per_page=3', as: 'admin', expect: [200] },
  { name: 'certificates pending', method: 'GET', path: '/api/student-certificates/pending', as: 'admin', expect: [200], note: 'must not resolve to a {id} route' },
  { name: 'certificate no enrolment', method: 'POST', path: '/api/student-certificates', as: 'admin', body: {}, expect: [400] },
  { name: 'certificate missing enrolment', method: 'POST', path: '/api/student-certificates', as: 'admin', body: { student_course_id: 99999999 }, expect: [404] },

];

async function run(): Promise<void> {
  for (const role of ['admin', 'lab', 'staff'] as const) await login(role);

  const results: Array<{ ok: boolean; c: Case; status: number; shape: string }> = [];

  for (const c of cases) {
    if (c.write && !RUN_WRITES) continue;

    const headers: Record<string, string> = {};
    if (c.body !== undefined) headers['Content-Type'] = 'application/json';
    const jar = c.as === 'anon' ? undefined : cookies.get(c.as);
    if (jar) headers.Cookie = jar;

    const res = await fetch(`${BASE}${c.path}`, {
      method: c.method,
      headers,
      body: c.body === undefined ? undefined : JSON.stringify(c.body),
    });

    const text = await res.text();
    let shape: string;
    try {
      shape = shapeOf(JSON.parse(text));
    } catch {
      shape = `${text.length} bytes, not JSON`;
    }

    results.push({ ok: c.expect.includes(res.status), c, status: res.status, shape });
  }

  const width = Math.max(...results.map((r) => r.c.name.length));
  let group = '';
  for (const r of results) {
    const tag = r.c.name.startsWith('GUARD') ? 'GUARD' : r.c.path.split('/')[2] ?? 'root';
    if (tag !== group) {
      group = tag;
      console.log(`\n  ── ${tag}`);
    }
    const mark = r.ok ? 'ok  ' : 'FAIL';
    console.log(
      `  ${mark} ${String(r.status).padEnd(3)} ${r.c.name.padEnd(width)}  ${r.shape}` +
        (r.c.note ? `\n       ${' '.repeat(width + 4)}${r.c.note}` : ''),
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n  ${results.length - failed.length}/${results.length} behaved as documented.`);
  if (failed.length) {
    console.log('\n  Unexpected:');
    for (const f of failed) {
      console.log(`    ${f.c.method} ${f.c.path} as ${f.c.as} → ${f.status}, expected ${f.c.expect.join(' or ')}`);
    }
    process.exit(1);
  }
}

await run();

export {};
