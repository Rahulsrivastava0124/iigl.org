import { useState } from 'react';
import { Grid, MenuItem, TextField, Typography } from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { DateField, Dialog, money, today } from './ui';
import { useToast } from './Toast';

/**
 * Paying a month's salary.
 *
 * It opens on the pro-rata figure — the agreed salary over the days in the
 * month, times the days attended — because that is the number somebody is
 * usually about to type. It is a suggestion and nothing more: the field is
 * editable, part payments are ordinary, and what is recorded is what was
 * actually handed over.
 */
export default function SalaryPay({
  empId,
  name,
  month,
  monthLabel,
  suggested,
  alreadyPaid,
  onClose,
  onPaid,
}: {
  empId: number;
  name: string;
  month: string;
  monthLabel: string;
  suggested: number;
  alreadyPaid: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const toast = useToast();
  const outstanding = Math.max(0, Math.round((suggested - alreadyPaid) * 100) / 100);

  const [amount, setAmount] = useState(String(outstanding > 0 ? outstanding : suggested));
  const [paidOn, setPaidOn] = useState(today());
  const [payMode, setPayMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/users/staff/salary/pay', {
        emp_id: empId,
        month,
        amount: Number(amount),
        paid_on: paidOn,
        pay_mode: payMode,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });
      toast.ok(`Paid ${money(Number(amount))} to ${name}.`);
      onPaid();
      onClose();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Pay ${name} — ${monthLabel}`}
      onClose={onClose}
      onSubmit={save}
      submitLabel="Record payment"
      busy={busy}
      disabled={!(Number(amount) > 0)}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Amount"
            type="number"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <DateField label="Paid on" value={paidOn} onChange={setPaidOn} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            label="Payment method"
            value={payMode}
            onChange={(e) => setPayMode(e.target.value)}
          >
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="upi">UPI</MenuItem>
            <MenuItem value="bank">Bank transfer</MenuItem>
            <MenuItem value="cheque">Cheque</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Grid>
        <Grid size={12}>
          <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Grid>
      </Grid>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        {alreadyPaid > 0
          ? `${money(alreadyPaid)} already paid for ${monthLabel}. `
          : ''}
        Opens at the salary for the days attended — {money(suggested)} — which is a suggestion, not
        a figure anybody has agreed. Part payments are ordinary; record what actually changed hands.
      </Typography>
    </Dialog>
  );
}
