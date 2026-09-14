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
};

/** The label for a stored payment mode, matched without case; `—` when there is none. */
export const payModeLabel = (m: string | null | undefined) =>
  m ? (PAY_MODE_LABEL[m.trim().toLowerCase()] ?? m) : '—';
