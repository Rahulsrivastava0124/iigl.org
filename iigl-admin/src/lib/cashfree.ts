import { api } from './api';

/**
 * Paying through Cashfree from the panel.
 *
 * The API makes the order and hands back a payment session; Cashfree's own
 * checkout opens over the page to take the money; then the API is asked to
 * check the order with Cashfree and record what it paid for. The checkout's
 * answer is only a cue to ask — whether money moved is the API's answer.
 */

export interface PaymentConfig {
  enabled: boolean;
  mode: 'sandbox' | 'production';
  gateway: 'cashfree';
}

export interface StartedPayment {
  order_id: string;
  payment_session_id: string;
  amount: number;
  mode: 'sandbox' | 'production';
}

export interface PaymentOutcome {
  order_id: string;
  purpose: 'commission' | 'student_registration' | 'enrolment_fee';
  status: 'created' | 'paid' | 'failed' | 'expired';
  amount: number;
  mode: string;
  result: Record<string, unknown> | null;
}

type CashfreeCheckout = { checkout: (o: { paymentSessionId: string; redirectTarget: '_modal' }) => Promise<{ error?: { message?: string }; paymentDetails?: unknown }> };
declare global {
  interface Window {
    Cashfree?: (o: { mode: 'sandbox' | 'production' }) => CashfreeCheckout;
  }
}

let sdk: Promise<void> | null = null;

/** Cashfree's checkout script, loaded once, when first needed. */
function loadSdk(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  sdk ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdk = null;
      reject(new Error('The payment window could not be loaded. Check the connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return sdk;
}

/**
 * Opens the checkout for a started payment, then confirms it with the API.
 * Resolves with the outcome — `paid`, or still `created` when the payer closed
 * the window without paying.
 */
export async function payWithCashfree(started: StartedPayment): Promise<PaymentOutcome> {
  await loadSdk();
  if (!window.Cashfree) throw new Error('The payment window could not be loaded.');
  const cashfree = window.Cashfree({ mode: started.mode });
  const result = await cashfree.checkout({ paymentSessionId: started.payment_session_id, redirectTarget: '_modal' });

  // Whatever the modal said, ask the API: a payment can succeed after an error
  // in the window, and a closed window can still leave a paid order.
  const confirmed = await api.post<{ data: PaymentOutcome }>(`/payments/${encodeURIComponent(started.order_id)}/confirm`, {});
  if (confirmed.data.status !== 'paid' && result.error?.message) {
    throw new Error(result.error.message);
  }
  return confirmed.data;
}

export const TEST_MODE_NOTE = 'Test mode — use Cashfree test cards or UPI; no real money is charged.';
