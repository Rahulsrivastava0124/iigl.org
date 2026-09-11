import { useState } from 'react';
import { Box, Button, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ExpenseIcon from '@mui/icons-material/ReceiptOutlined';
import SendIcon from '@mui/icons-material/SendOutlined';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { isLab, isSuper } from '../lib/portal';
import { Dialog, Notice, Pager, hint, money } from '../components/ui';
import { useToast } from '../components/Toast';
import FileField from '../components/FileField';
import { LedgerTable, LedgerTotals, type LedgerPage } from '../components/Ledger';

/**
 * The wallet: this account's money, and every movement that made it.
 *
 * Reached from the wallet figures on the dashboard — head office's "Current
 * wallet", a laboratory's "My wallet" — which is where somebody looks when the
 * number is not the one they expected. The answer to that is never a total; it
 * is the list of what went in and out, so the wallet *is* the ledger, with the
 * balance stated above it.
 *
 * It used to be a list of approved commission credits, which answered the
 * question for head office alone and left a laboratory clicking through to a
 * screen it was not allowed to open.
 *
 * Both roles read the same endpoint: `/transactions/ledger` scopes to whoever
 * is asking, so nothing here decides what anyone may see.
 */
export default function Wallet() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);

  const PER_PAGE = 50;
  const ledger = useFetch<{ data: LedgerPage }>(
    `/transactions/ledger?page=${page}&per_page=${PER_PAGE}`,
  );
  const account = ledger.data?.data;
  const entries = account?.entries ?? [];
  const total = account?.total ?? 0;

  /*
    What an employee does with the money they hold: spend some of it on the
    laboratory's behalf, or hand it in. Both wait for the employer's approval,
    and neither moves the balance until they have it.

    Staff only. Head office and a laboratory have no employer to hand money to
    or to approve an expense — a laboratory pays head office through Commission.
  */
  const toast = useToast();
  const isStaff = Boolean(user) && !isSuper(user) && !isLab(user);

  type Kind = 'expense' | 'transfer';
  const [kind, setKind] = useState<Kind | null>(null);
  const [payMode, setPayMode] = useState('cash');
  const [amount, setAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (next: Kind) => {
    setKind(next);
    setPayMode('cash');
    setAmount('');
    setRemark('');
    setReference('');
    setProof(null);
  };

  // Cash was counted and leaves nothing behind; everything else has a reference.
  const traceable = payMode !== 'cash';
  const value = Number(amount);
  const ready = value > 0 && (kind !== 'expense' || remark.trim() !== '');

  const submit = async () => {
    if (!kind || !ready) return;
    setBusy(true);
    try {
      const body = {
        amount: value,
        pay_mode: payMode,
        transaction_no: traceable ? reference.trim() || null : null,
        remark: remark.trim() || null,
        attachment: proof,
      };
      if (kind === 'expense') {
        await api.post('/transactions/expense', body);
        toast.ok('Expense sent for approval.');
      } else {
        await api.post('/transactions', body);
        toast.ok('Sent to your laboratory for approval.');
      }
      setKind(null);
      ledger.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {isStaff && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, justifyContent: 'flex-end' }}>
          <Button variant="outlined" startIcon={<ExpenseIcon />} onClick={() => open('expense')}>
            Add Expense
          </Button>
          <Button variant="contained" startIcon={<SendIcon />} onClick={() => open('transfer')}>
            Send to Laboratory
          </Button>
        </Stack>
      )}

      <LedgerTotals account={account} />

      {/*
        Pending money is money nobody has agreed to yet: it is on the statement,
        marked, but it has not moved the balance. Said once, here, rather than
        left for somebody to work out from a chip in a row.
      */}
      {(account?.pending_out ?? 0) > 0 && (
        <Notice kind="warn" sx={{ mb: 2 }}>
          {(account?.pending_out ?? 0).toLocaleString('en-IN')} is awaiting approval and has not
          been taken off the balance.
        </Notice>
      )}

      <LedgerTable
        entries={entries}
        loading={ledger.loading}
        error={ledger.error}
        title={isSuper(user) ? 'Head office account' : 'Your account'}
        count={ledger.loading ? 'Loading…' : `${total.toLocaleString()} movements`}
        footer={
          <Pager
            meta={{
              page,
              per_page: PER_PAGE,
              total,
              total_pages: Math.max(1, Math.ceil(total / PER_PAGE)),
            }}
            onPage={setPage}
          />
        }
      />

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Credits are money received, debits money sent on. The balance is the running total after
          each approved movement; declined and pending rows appear so the history is complete but
          leave it unchanged.
        </Typography>
      </Box>

      {kind && (
        <Dialog
          title={kind === 'expense' ? 'Add Expense' : 'Send to Laboratory'}
          onClose={() => setKind(null)}
          onSubmit={submit}
          submitLabel={kind === 'expense' ? 'Send for approval' : 'Send'}
          busy={busy}
          disabled={!ready}
        >
          {/* The method first: it decides whether there is a reference to give. */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Payment method"
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="card">Card</MenuItem>
                <MenuItem value="bank">Bank transfer</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Amount"
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                slotProps={{
                  htmlInput: { min: 0, step: '0.01' },
                  // What they hold, as a guide rather than a limit: somebody
                  // who paid a courier from their own pocket is still owed it.
                  ...hint(`You currently hold ${money(account?.balance ?? 0)}.`),
                }}
              />
            </Grid>

            <Grid size={12}>
              <TextField
                label={kind === 'expense' ? 'What was it for' : 'Note'}
                placeholder={kind === 'expense' ? 'Eg. Courier to Kolkata' : 'Optional'}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                required={kind === 'expense'}
                slotProps={{ htmlInput: { maxLength: 255 } }}
              />
            </Grid>

            {traceable && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Reference number"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  slotProps={hint('The UPI, card or bank reference.')}
                />
              </Grid>
            )}

            {/* A bill is worth keeping for any expense, cash included — cash
                is exactly when the receipt is the only record. A transfer only
                has proof to attach when it was not cash. */}
            {(kind === 'expense' || traceable) && (
              <Grid size={12}>
                <FileField
                  label={kind === 'expense' ? 'Bill photo' : 'Payment proof'}
                  bucket="screenshot"
                  accept="image/*,application/pdf"
                  value={proof}
                  onChange={setProof}
                  helperText={
                    kind === 'expense'
                      ? 'The receipt your laboratory approves this against.'
                      : 'The screenshot or receipt your laboratory approves this against.'
                  }
                />
              </Grid>
            )}
          </Grid>
        </Dialog>
      )}
    </>
  );
}
