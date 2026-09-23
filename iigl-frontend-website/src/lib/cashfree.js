import { apiUrl, postStudent } from './api.js';

/**
 * Paying the course fee through Cashfree.
 *
 * The API prices the course and makes the order; Cashfree's checkout opens over
 * the page to take the money; then the API is asked to check the order with
 * Cashfree and register the student. The checkout's own answer is only the cue
 * to ask — whether the student is registered is the API's answer.
 */

let sdk = null;

/** Cashfree's checkout script, loaded once, when first needed. */
function loadSdk() {
  if (window.Cashfree) return Promise.resolve();
  sdk ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      sdk = null;
      reject(new Error('The payment window could not be loaded. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return sdk;
}

async function postJson(path, body) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    // Form-encoded, like the rest of the site's posts: no preflight to ask first.
    body: new URLSearchParams(body ?? {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.message ?? 'Something went wrong. Please try again.');
  return json.data;
}

/** `{ enabled, mode }` — whether the site may offer online payment, and whether it is test mode. */
export async function paymentConfig() {
  try {
    const response = await fetch(apiUrl('/public/payments/config'));
    if (!response.ok) return { enabled: false, mode: 'sandbox' };
    return (await response.json()).data;
  } catch {
    return { enabled: false, mode: 'sandbox' };
  }
}

/**
 * Starts the payment for a registration, opens the checkout, then confirms.
 * Resolves with the API's outcome: `status` is `paid` (and `result` carries the
 * registration number) or still `created` when the window was closed unpaid.
 * `beforeCheckout` / `afterCheckout` let the caller step its own modal aside.
 */
export async function registerAndPay(fields, { beforeCheckout, afterCheckout } = {}) {
  const started = await postJson('/public/student-registrations/pay', fields);
  await loadSdk();
  if (!window.Cashfree) throw new Error('The payment window could not be loaded.');

  beforeCheckout?.();
  let result;
  try {
    result = await window.Cashfree({ mode: started.mode }).checkout({
      paymentSessionId: started.payment_session_id,
      redirectTarget: '_modal',
    });
  } finally {
    afterCheckout?.();
  }

  const outcome = await postJson(`/public/payments/${encodeURIComponent(started.order_id)}/confirm`);
  if (outcome.status !== 'paid' && result?.error?.message) throw new Error(result.error.message);
  return outcome;
}

/**
 * A signed-in student paying (the balance of) their course fee.
 *
 * Same three steps as the registration payment, over the credentialed student
 * portal endpoints: start the payment, open the checkout, then ask the API to
 * confirm it with Cashfree — which is what records the fee as paid. Resolves
 * with the outcome; `status` is `paid` when it went through.
 */
export async function payStudentEnrolment(enrolmentId, { beforeCheckout, afterCheckout } = {}) {
  return payStudent(`/enrolments/${enrolmentId}/pay`, { beforeCheckout, afterCheckout });
}

/** The same, for the course registered for and not yet enrolled on: paying enrols. */
export function payStudentRegistration(hooks) {
  return payStudent('/registration/pay', hooks);
}

async function payStudent(startPath, { beforeCheckout, afterCheckout } = {}) {
  const started = await postStudent(startPath);
  await loadSdk();
  if (!window.Cashfree) throw new Error('The payment window could not be loaded.');

  beforeCheckout?.();
  let result;
  try {
    result = await window.Cashfree({ mode: started.mode }).checkout({
      paymentSessionId: started.payment_session_id,
      redirectTarget: '_modal',
    });
  } finally {
    afterCheckout?.();
  }

  const outcome = await postStudent(`/payments/${encodeURIComponent(started.order_id)}/confirm`);
  if (outcome.status !== 'paid' && result?.error?.message) throw new Error(result.error.message);
  return outcome;
}
