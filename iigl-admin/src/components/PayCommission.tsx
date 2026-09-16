import { useState } from 'react';
import { Grid, MenuItem, TextField } from '@mui/material';
import { useToast } from './Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { payWithCashfree, type PaymentConfig, type StartedPayment } from '../lib/cashfree';
import { ConfirmDialog, Dialog, hint, money } from './ui';
import PayIcon from '@mui/icons-material/PaymentsOutlined';

/**
 * Paying commission: cash handed over, or paid online through Cashfree.
 *
 * The dialog asks for what is being transferred and nothing else. It used to
 * ask for the pieces certified, or the takings the share was reckoned on, and
 * derive the amount from the laboratory's configured rate — correct arithmetic
 * and the wrong question: a laboratory settling its account knows the figure it
 * is sending, and often it is an old balance or a round number agreed on the
 * phone that no single collection explains.
 *
 * Cash is raised pending, and head office approves or declines it when the
 * money arrives. Online is recorded approved once Cashfree confirms it.
 *
 * It lives here rather than on the transactions screen because a laboratory
 * pays from wherever it is told what it owes — that screen, and the row of the
 * statement that says so. Sending it to another page to pay lost the statement
 * it was paying.
 */
export function PayCommissionDialog({
  due,
  onClose,
  onPaid,
}: {
  /** What is outstanding. The amount opens here and can be edited down. */
  due: number;
  onClose: () => void;
  /** Sent and recorded: reload whatever was showing the balance. */
  onPaid: () => void;
}) {
  const toast = useToast();
  const [payMode, setPayMode] = useState('cash');
  const [payAmount, setPayAmount] = useState(due > 0 ? String(due) : '');
  const [sending, setSending] = useState(false);
  /*
    Cash is a claim about money that changed hands outside the software: nothing
    confirms it, and head office is asked to approve what this says happened. So
    it is asked for once more, in its own box, before it is sent. Online needs
    no such thing — Cashfree is the confirmation.
  */
  const [confirming, setConfirming] = useState(false);

  /*
    Two ways only. Cash is counted, and its receipt is the transaction row
    itself. Online goes through Cashfree, which is its own record of the money —
    so neither asks for a reference or a screenshot.
  */
  const online = payMode === 'online';
  // Whether Cashfree is set up, and whether it is test mode.
  const gateway = useFetch<{ data: PaymentConfig }>('/payments/config');
  const gatewayOn = Boolean(gateway.data?.data.enabled);
  const testMode = gateway.data?.data.mode !== 'production';

  const amount = Math.round((Number(payAmount) || 0) * 100) / 100;

  const pay = async () => {
    setSending(true);
    try {
      /*
        Online: Cashfree takes the money in its own window, and the API records
        the remittance — approved, since the gateway has confirmed it — only
        once Cashfree says the order is paid.
      */
      if (online) {
        const started = await api.post<{ data: StartedPayment }>('/payments/commission', { amount });
        const outcome = await payWithCashfree(started.data);
        if (outcome.status === 'paid') {
          toast.ok(`${money(outcome.amount)} paid online${testMode ? ' (test mode)' : ''}. Recorded as approved.`);
          onPaid();
          onClose();
        } else {
          toast.error('The payment was not completed. Nothing was charged or recorded.');
        }
        return;
      }
      await api.post('/transactions/commission', {
        amount,
        pay_mode: payMode,
        transaction_no: null,
        attachment: null,
      });
      toast.ok('Commission sent. It waits on head office to approve it.');
      onPaid();
      onClose();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      title="Pay commission"
      onClose={onClose}
      onSubmit={() => (online ? pay() : setConfirming(true))}
      submitLabel={
        amount > 0
          ? `${online ? 'Pay' : 'Send'} ${money(amount)}${online ? ' online' : ''}`
          : online
            ? 'Pay online'
            : 'Send'
      }
      busy={sending}
      disabled={amount <= 0}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            label="Payment method"
            value={payMode}
            onChange={(e) => setPayMode(e.target.value)}
          >
            <MenuItem value="cash">Cash</MenuItem>
            {/* Cashfree: cards, UPI, netbanking, in its own window. */}
            <MenuItem value="online" disabled={!gatewayOn}>
              Pay online (Cashfree){gatewayOn ? '' : ' — not set up'}
            </MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Amount"
            type="number"
            required
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            slotProps={{
              htmlInput: { min: 0, step: '0.01' },
              ...hint('Opens at what is outstanding. Type less to pay part of it.'),
            }}
          />
        </Grid>
      </Grid>

      {/* Cash only: asked after Send, not as something to tick beforehand. */}
      <ConfirmDialog
        open={confirming}
        danger={false}
        title="Confirm cash payment"
        message={`Send ${money(amount)} in cash to head office?`}
        warning="It is recorded as sent and waits there for approval. Only head office can decide it."
        confirmLabel={`Send ${money(amount)}`}
        confirmIcon={PayIcon}
        busy={sending}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await pay();
          setConfirming(false);
        }}
      />
    </Dialog>
  );
}
