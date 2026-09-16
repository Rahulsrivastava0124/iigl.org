/**
 * How each way of paying is written wherever a movement is listed.
 *
 * Kept out of the components that print it so a list and its filter read the
 * same labels from one place — a filter offering "Bank" over a column that says
 * "Bank transfer" is two names for one thing. Older rows carry whatever was
 * typed at the time, so anything not in here is shown as it was stored.
 */
export const PAY_MODE_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank transfer',
  cheque: 'Cheque',
  // Paid through Cashfree. The filter's one "Online" matches every method.
  online: 'Online',
};

/** How Cashfree names a method, as the panel says it. */
const ONLINE_METHOD: Record<string, string> = {
  upi: 'UPI',
  debit_card: 'Debit card',
  credit_card: 'Credit card',
  net_banking: 'Netbanking',
  wallet: 'Wallet',
  pay_later: 'Pay later',
  cardless_emi: 'Cardless EMI',
  credit_card_emi: 'Credit card EMI',
  debit_card_emi: 'Debit card EMI',
  bank_transfer: 'Bank transfer',
  upi_credit_card: 'UPI (credit card)',
};

/**
 * The label for a stored payment mode, matched without case; `—` when there is
 * none. A gateway payment is stored `online_<method>` and reads "Online (UPI)".
 */
export const payModeLabel = (m: string | null | undefined) => {
  if (!m) return '—';
  const key = m.trim().toLowerCase();
  if (key.startsWith('online_')) {
    const method = key.slice('online_'.length);
    const name = ONLINE_METHOD[method] ?? method.replace(/_/g, ' ').replace(/^w/, (c) => c.toUpperCase());
    return `Online (${name})`;
  }
  return PAY_MODE_LABEL[key] ?? m;
};
