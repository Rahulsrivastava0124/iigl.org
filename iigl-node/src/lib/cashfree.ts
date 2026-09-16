import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

/**
 * Cashfree Payment Gateway, over its REST API.
 *
 * Only what the payments here need: make an order, read an order back, read
 * its payments, and check that a webhook really came from Cashfree. No SDK — the
 * four calls are small, and a dependency that pins an API version is one more
 * thing to upgrade in step with the dashboard.
 *
 * Every answer about whether money moved comes from here, server to server.
 * The browser's checkout result says the modal closed, which is not the same
 * thing.
 */

export const cashfreeConfigured = Boolean(env.cashfree.appId && env.cashfree.secretKey);
export const cashfreeMode = env.cashfree.mode;

const BASE = env.cashfree.mode === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

export class CashfreeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!cashfreeConfigured) throw new CashfreeError('Online payment is not set up.', 503);
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-client-id': env.cashfree.appId,
      'x-client-secret': env.cashfree.secretKey,
      'x-api-version': env.cashfree.apiVersion,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    // Cashfree's own sentence where it gives one; the status otherwise. Never
    // the credentials, which are in the request, not the answer.
    throw new CashfreeError(json?.message ?? `Cashfree answered ${response.status}.`, response.status, json?.code);
  }
  return json as T;
}

export interface CashfreeOrder {
  cf_order_id: string | number;
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'TERMINATED' | 'TERMINATION_REQUESTED';
  payment_session_id: string;
}

export interface CashfreePayment {
  cf_payment_id: string | number;
  payment_status: string;
  payment_amount: number;
  payment_group?: string;
  payment_time?: string;
  bank_reference?: string;
}

export function createOrder(input: {
  orderId: string;
  amount: number;
  customer: { id: string; name?: string | null; phone: string; email?: string | null };
  note: string;
  returnUrl?: string;
}): Promise<CashfreeOrder> {
  return call<CashfreeOrder>('POST', '/orders', {
    order_id: input.orderId,
    order_amount: Math.round(input.amount * 100) / 100,
    order_currency: 'INR',
    order_note: input.note.slice(0, 200),
    customer_details: {
      customer_id: input.customer.id,
      customer_phone: input.customer.phone,
      ...(input.customer.name ? { customer_name: input.customer.name.slice(0, 100) } : {}),
      ...(input.customer.email ? { customer_email: input.customer.email } : {}),
    },
    order_meta: {
      ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
      ...(env.cashfree.notifyUrl ? { notify_url: env.cashfree.notifyUrl } : {}),
    },
  });
}

export const getOrder = (orderId: string) => call<CashfreeOrder>('GET', `/orders/${encodeURIComponent(orderId)}`);

export const getPayments = (orderId: string) =>
  call<CashfreePayment[]>('GET', `/orders/${encodeURIComponent(orderId)}/payments`);

/**
 * Whether a webhook is Cashfree's: base64 HMAC-SHA256, with the secret key, of
 * the timestamp header followed by the raw body exactly as it arrived.
 */
export function verifyWebhook(rawBody: string, timestamp: string | undefined, signature: string | undefined): boolean {
  if (!cashfreeConfigured || !timestamp || !signature) return false;
  const expected = Buffer.from(createHmac('sha256', env.cashfree.secretKey).update(timestamp + rawBody).digest('base64'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
