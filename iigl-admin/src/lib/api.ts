import { apiUrl } from './config';

/**
 * Thin wrapper over fetch for the IIGL API.
 *
 * Authentication is a session cookie, so every call sends credentials. The API
 * location comes from VITE_API_URL — see config.ts.
 */

export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties, which the
  // Vite template disallows via erasableSyntaxOnly.
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Called when the API says the session is gone. Set by the auth provider so a
 * expired session returns the whole panel to the sign-in screen, rather than
 * every open screen rendering "Sign in to continue." as if it were data.
 */
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

/**
 * What a dead API looks like from here.
 *
 * Two shapes, one cause. A cross-origin build reaches the API directly and the
 * fetch rejects; a same-origin build goes through the dev proxy, which answers
 * 502 with an empty body when nothing is listening. Both used to surface as
 * "Failed to fetch" or "Request failed (502)" on whichever screen asked first,
 * which says nothing about what to do next.
 */
const OFFLINE = 'Cannot reach the API. Check that it is running.';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      credentials: 'include',
      headers: init.body ? { 'Content-Type': 'application/json' } : {},
      ...init,
    });
  } catch {
    // fetch only rejects for a transport failure: no server, DNS, CORS, or a
    // dropped connection. Anything the server answered arrives as a response.
    throw new ApiError(0, OFFLINE, 'offline');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body means something upstream failed; keep the raw text.
  }

  if (!res.ok) {
    // A 401 means the session expired or was never established. That is not a
    // failure of the screen that happened to be open, so it is handled once
    // here rather than shown as an error on whichever screen noticed first.
    if (res.status === 401 && !path.startsWith('/auth/')) onSessionLost?.();

    // A gateway status with nothing in the body is the proxy saying it could
    // not reach the API, not the API saying anything. `body?.message` is the
    // test rather than the status alone: a real 503 from the API carries a
    // message of its own and should be shown as written.
    if (!body?.message && res.status >= 502 && res.status <= 504) {
      throw new ApiError(res.status, OFFLINE, 'offline');
    }

    throw new ApiError(
      res.status,
      body?.message ?? `Request failed (${res.status})`,
      body?.error ?? 'error',
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ---------------------------------------------------------------- API shapes

export interface SessionUser {
  id: number;
  fullname: string;
  /** Null for somebody with no role: their permissions were granted one by one. */
  roleId: number | null;
  labId: number | null;
  /**
   * `users.profile_photo`, as Laravel stored it. Read with `fileUrl`.
   *
   * Not part of the session cookie: it is read from the row on each sign-in
   * and on `/auth/me`, so a new photograph shows on the next load rather than
   * on the next sign-in.
   */
  photo?: string | null;
}

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export interface Order {
  id: number;
  order_no: string;
  customer_name: string;
  mobile: string;
  lab_id: number;
  order_date: string;
  status: string;
  total_amount: string | null;
  paid_amount: string | null;
  dues_amount: string | null;
}

export interface Report {
  id: number;
  report_no: string;
  order_no: string;
  carat_weight: string;
  gross_weight: string;
  lab_id: number;
  created_at: string | null;
}

export interface Transaction {
  id: number;
  amount: string;
  /** The sale the commission was worked out from. Null on other kinds. */
  comission_on: number | null;
  send_by: number;
  received_by: number;
  /** Resolved by the list endpoint. Null when the id is the walk-in sentinel 0. */
  send_by_name: string | null;
  received_by_name: string | null;
  status: number;
  transaction_type: string | null;
  pay_mode: string;
  transaction_no: string | null;
  remark: string | null;
  /** `public/uploads/…`, the payment proof. Render with `fileUrl`. */
  attachment: string | null;
  created_at: string | null;
}

export interface Lab {
  id: number;
  /** The code employments name this laboratory by — `employements.parent_id`. */
  empid: string | null;
  fullname: string;
  /** The person behind the laboratory, where the account records one. */
  owner_name: string | null;
  mobile: string;
  city: string | null;
  commision: number | null;
  /** How that rate reads: `percent` of what was collected, or `per_pc`. */
  commission_type: string | null;
  is_active: number;
  role_id: number;
  /** People working under it — `employements.parent_id` holding its `empid`. */
  staff: number;
  /**
   * What the rate has earned on what this laboratory has actually collected,
   * what has been approved against it, and the difference. Summed by the list
   * endpoint the same way the dashboard sums them, so the two agree.
   */
  commission_accrued: number;
  commission_paid: number;
  commission_due: number;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  short_description: string | null;
  /** `public/uploads/icon/…`, as Laravel stored it. Render with `fileUrl`. */
  icon: string | null;
  banner: string | null;
  /** A `units.id`, held as text. The weight every item in the category is priced by. */
  unit: string | null;
}

export interface Subcategory {
  id: number;
  name: string;
  description: string | null;
  category_id: number;
}

export interface Attribute {
  id: number;
  attr_name: string;
  category_id: number;
  subcategory_id: number;
  show_in_smart_card: number;
  show_in_classic_card: number;
  /** The description/comment box on the certificate form. */
  show_description: number;
  /** The item image upload on the certificate form. */
  show_image: number;
  is_opensource: number;
  is_required: number;
  order_no: number;
}

export interface Price {
  id: number;
  category_id: string;
  lab_id: string | null;
  min_wt: number;
  max_wt: number;
  rate: string;
  smart_price: number;
  classic_price: number;
  /** A row of the GST master list, or null where the band names no rate. */
  gst_id: number | null;
  /** A rate typed for this band alone. Set only when `gst_id` is null. */
  gst_percent: string | null;
}

/** One month of the dashboard chart. */
export interface TrendMonth {
  month: string;
  label: string;
  orders: number;
  reports: number;
}

export interface DashboardSummary {
  orders: { total: number; active: number; delivered: number; today: number };
  reports: { total: number };
  cards: { smart: number; classic: number };
  money: { sale: number; paid: number; dues: number; sale_today: number };
  wallet: {
    balance: number;
    commission_accrued: number;
    commission_paid: number;
    commission_dues: number;
    on_approval: number;
  };
  people: {
    /** Null for a laboratory: it is one, so it does not count them. */
    laboratories: number | null;
    employees: number;
    customers_registered: number;
    customers_unregistered: number;
  };
}
