import { useEffect, useState } from 'react';
import { Box, Button, Grid, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import ExpenseIcon from '@mui/icons-material/ReceiptOutlined';
import SendIcon from '@mui/icons-material/SendOutlined';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import { apiUrl } from '../lib/config';
import { messageOf, useAuth } from '../lib/auth';
import { isLab, isSuper } from '../lib/portal';
import { DateField, Dialog, DEFAULT_PER_PAGE, Pager, Panel, SearchField, hint, money } from '../components/ui';
import DateRangeField from '../components/DateRangeField';
import { StatementsTable } from '../components/Statements';
import { useToast } from '../components/Toast';
import FileField from '../components/FileField';
import { LedgerTable, LedgerTotals, type LedgerPage } from '../components/Ledger';
import { payModeLabel } from '../lib/payModes';

/**
 * A header button that is the icon alone on a phone.
 *
 * 40px to match the small fields it sits with, and on `xs` it drops its label
 * and shrinks to a square — the icon is the whole button — so the header row
 * does not spend a line on wide, half-empty buttons. The label returns from
 * `sm` up, where there is room for it.
 */
const ICON_ON_PHONE = {
  whiteSpace: 'nowrap',
  height: 40,
  flexShrink: 0,
  minWidth: { xs: 40, sm: 'auto' },
  px: { xs: 0, sm: 2 },
  '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: { xs: 0, sm: -0.5 } },
} as const;

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
  /** Rows per page. Was a constant; the footer now offers it. */
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  /**
   * Which half of the account is on screen.
   *
   * A laboratory has two: the movements themselves, and the commission it is
   * billed for them. They were stacked, and the statements panel sat above the
   * ledger with an empty table in it for the whole of the first period — a
   * screen whose first answer is "nothing yet" to a question nobody asked.
   * Only a laboratory sees the choice; everybody else has one account and no
   * statements, so no tab strip either.
   */
  const [tab, setTab] = useState<'account' | 'statements'>('account');

  /** The row an accept or decline is in flight for, on any list on this page. */
  const [deciding, setDeciding] = useState<number | null>(null);

  /*
    An employee holds two kinds of money, and they are kept apart.

    Collection is what customers paid them, which belongs to the laboratory and
    is handed on. Expense is the float the laboratory sent them to spend on its
    behalf. An expense comes out of the float, never out of a customer's money,
    and the float is never handed back as if it were takings.

    Read before the ledger fetch because the ledger is scoped by it.
  */
  const staff = Boolean(user) && !isSuper(user) && !isLab(user);
  const [wallet, setWallet] = useState<'collection' | 'expense'>('collection');

  /*
    The statement's period: a month, or any two dates.

    One pair of dates underneath, and the month is a quick way to fill both —
    choosing Sep 2026 sets the 1st to the 30th. Typing a date by hand clears the
    month, because a month showing over a range it no longer describes is the
    control lying about the list below it.

    The running balance does not restart at the top of the period. The API
    folds everything earlier into an opening balance, so each row still shows
    where the account really stood that day.
  */
  const [month, setMonth] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const period = from !== '' || to !== '';

  const pickMonth = (m: string) => {
    setMonth(m);
    if (m === '') {
      setFrom('');
      setTo('');
    } else {
      const first = dayjs(`${m}-01`);
      setFrom(first.format('YYYY-MM-DD'));
      setTo(first.endOf('month').format('YYYY-MM-DD'));
    }
    setPage(1);
  };
  const pickRange = (nextFrom: string, nextTo: string) => {
    setMonth('');
    setFrom(nextFrom);
    setTo(nextTo);
    setPage(1);
  };

  /*
    Which rows to list: one status, and a word to look for.

    They narrow the list and nothing else. The running balance on each row and
    the totals above are still the whole period's, so a row found by its
    reference still says where the account really stood after it.
  */
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  /** One box over both of the row's own words: its reference and its remark. */
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  /*
    The payment types this wallet actually has, not every mode the system knows:
    an account that has only seen cash and Cashfree was offered cheques and bank
    transfers that could only ever list nothing. The API names them for the
    period; they are kept while the next page loads so the list does not empty.

    Gateway payments are stored per method (online_upi, online_debit_card). With
    more than one, "Online — all methods" comes first and each method follows.
  */
  const [modes, setModes] = useState<string[]>([]);
  const isOnline = (m: string) => m === 'online' || m.startsWith('online_');
  const onlineKinds = modes.filter(isOnline);
  const modeOptions: [string, string][] = [
    ...modes
      .filter((m) => !isOnline(m))
      .sort((a, b) => (a === 'cash' ? -1 : b === 'cash' ? 1 : a.localeCompare(b)))
      .map((m): [string, string] => [m, payModeLabel(m)]),
    ...(onlineKinds.length === 0
      ? []
      : onlineKinds.length === 1
        ? [['online', payModeLabel(onlineKinds[0])] as [string, string]]
        : [
            ['online', 'Online — all methods'] as [string, string],
            ...onlineKinds.filter((m) => m !== 'online').map((m): [string, string] => [m, payModeLabel(m)]),
          ]),
  ];
  // A choice still in force stays selectable even when the period no longer has it.
  if (mode !== '' && !modeOptions.some(([value]) => value === mode)) {
    modeOptions.push([mode, mode === 'online' ? 'Online' : payModeLabel(mode)]);
  }

  /*
    The controls that choose the rows. One strip, which folds onto another line
    when the panel is narrow: each control keeps its own width, because a date
    range squeezed to "0-09-2026" is worse than a second line.

    The Statement button is not among them. It acts on what they have chosen
    rather than choosing anything, and left in the strip it was the one control
    that wrapped on its own to a line holding nothing else.
  */
  const filters = (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, '& > *': { flexShrink: 0 } }}
    >
      <DateField month label="Month" value={month} onChange={pickMonth} sx={{ width: 150 }} />
      <DateRangeField label="From – To" from={from} to={to} onChange={pickRange} width={250} />
      <TextField
        select
        label="Status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        sx={{ width: 130 }}
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      >
        <MenuItem value="">All</MenuItem>
        <MenuItem value="0">Pending</MenuItem>
        <MenuItem value="1">Approved</MenuItem>
        <MenuItem value="2">Declined</MenuItem>
      </TextField>
      <TextField
        select
        label="Payment type"
        value={mode}
        onChange={(e) => {
          setMode(e.target.value);
          setPage(1);
        }}
        sx={{ width: 150 }}
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      >
        <MenuItem value="">All</MenuItem>
        {modeOptions.map(([value, label]) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      <SearchField
        placeholder="Reference or remark"
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        width={220}
      />
      {(period || status !== '' || mode !== '' || search !== '') && (
        <Button
          size="small"
          onClick={() => {
            pickMonth('');
            setStatus('');
            setMode('');
            setSearch('');
          }}
        >
          Clear
        </Button>
      )}
    </Stack>
  );

  /*
    The statement for exactly what is on screen: this wallet, these dates, and
    the status, payment type and search as they stand. Every matching row, not
    the page being looked at. A filtered sheet says which filters made it and
    totals only what it prints.

    Opened rather than fetched, so the browser's own viewer shows it and prints
    or saves it from there.
  */
  const statement = (
      <Button
        variant="contained"
        startIcon={<DownloadIcon />}
        aria-label="Statement"
        onClick={() => {
          const q = new URLSearchParams();
          if (staff) q.set('scope', wallet);
          if (from) q.set('from', from);
          if (to) q.set('to', to);
          if (status !== '') q.set('status', status);
          if (mode !== '') q.set('mode', mode);
          if (term.trim()) q.set('q', term.trim());
          const qs = q.toString();
          window.open(apiUrl(`/transactions/ledger/statement${qs ? `?${qs}` : ''}`), '_blank', 'noopener');
        }}
        // The same 40px as the small fields beside it, so the row reads as one
        // strip of controls rather than a button sitting short of them. On a
        // phone it is the icon alone — the label is dropped and the button
        // shrinks to a square, so the buttons do not take a row to themselves.
        sx={{
          whiteSpace: 'nowrap',
          height: 40,
          flexShrink: 0,
          minWidth: { xs: 40, sm: 'auto' },
          px: { xs: 0, sm: 2 },
          '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: { xs: 0, sm: -0.5 } },
        }}
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          Statement
        </Box>
      </Button>
  );

  /*
    The header of a tabbed wallet, in the same two bands as the plain one: which
    wallet and the button that downloads it on top, the controls that choose the
    rows under them. Held to a single row they were a strip wide enough to push
    the search box — or the button — onto a line of its own.

    `withFilters` is false on a tab that has none, and the rule stays on the tab
    row so the table under it is still ruled off.
  */
  const header = (tabs: React.ReactNode, withFilters = true) => (
    <>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          px: 2,
          py: 0.75,
          mb: withFilters ? 0 : 1,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          rowGap: 1,
          borderBottom: withFilters ? 0 : 1,
          borderColor: 'divider',
        }}
      >
        {tabs}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          {outgoings}
          {withFilters && statement}
        </Stack>
      </Stack>
      {withFilters && (
        <Box sx={{ px: 2, pb: 1.25, mb: 1, borderBottom: 1, borderColor: 'divider' }}>{filters}</Box>
      )}
    </>
  );

  const ledger = useFetch<{ data: LedgerPage }>(
    `/transactions/ledger?page=${page}&per_page=${perPage}${staff ? `&scope=${wallet}` : ''}` +
      `${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}` +
      `${status !== '' ? `&status=${status}` : ''}` +
      `${mode !== '' ? `&mode=${mode}` : ''}` +
      `${term.trim() ? `&q=${encodeURIComponent(term.trim())}` : ''}`,
  );
  const account = ledger.data?.data;
  useEffect(() => {
    if (account?.modes) setModes(account.modes);
  }, [account]);
  const entries = account?.entries ?? [];
  const total = account?.total ?? 0;

  /*
    Money going out of this wallet: spent, or handed in.

    An expense is anybody's — a laboratory and head office spend their own
    money, a staff member spends the float their employer handed over — and none
    of them waits for an approval, because in each case the money has already
    gone.

    Handing in is the staff member's alone: head office and a laboratory have
    nobody to hand money to, and a laboratory pays head office through
    Commission.
  */
  const toast = useToast();

  const decide = async (id: number, next: 1 | 2) => {
    setDeciding(id);
    try {
      await api.post(`/transactions/${id}/status`, { status: next });
      toast.ok(next === 1 ? 'Accepted.' : 'Declined.');
      // A decision moves the balance, so the account is read again.
      ledger.reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeciding(null);
    }
  };
  const isStaff = staff;

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
        toast.ok('Expense recorded.');
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

  /*
    What this wallet can do, on the same row as the heading: record money spent,
    and — a staff member's only — hand what they hold to their laboratory. They
    sat on a strip of their own above the totals, which spent a band of the
    screen on two buttons.
  */
  const outgoings = (
    <>
      <Button
        variant="outlined"
        startIcon={<ExpenseIcon />}
        aria-label="Add Expense"
        onClick={() => open('expense')}
        sx={ICON_ON_PHONE}
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          Add Expense
        </Box>
      </Button>
      {isStaff && (
        <Button
          variant="outlined"
          startIcon={<SendIcon />}
          aria-label="Send to Admin"
          onClick={() => open('transfer')}
          sx={ICON_ON_PHONE}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Send to Admin
          </Box>
        </Button>
      )}
    </>
  );

  return (
    <>
      {/* The statements tab has periods of its own; the totals describe the
          account, so they follow its filter only while the account is shown. */}
      <LedgerTotals account={account} period={period} />

      {/*
        The laboratory's two halves, behind tabs and with no panel heading over
        them: a heading reading "Your account" above a tab named "Your account"
        put the same words twice on top of each other. Panel drops its whole
        header row when nothing is passed for it, so the strip lands flush at
        the top edge and carries its own padding.
      */}
      {staff ? (
        <Panel
          footer={
            <Pager
              meta={{
                page,
                per_page: perPage,
                total,
                total_pages: Math.max(1, Math.ceil(total / perPage)),
              }}
              onPage={setPage}
              onPerPage={(n) => {
                setPerPage(n);
                setPage(1);
              }}
            />
          }
        >
          {header(
            <Tabs
              value={wallet}
              onChange={(_, v) => {
                setWallet(v);
                setPage(1);
              }}
            >
              <Tab value="collection" label="Wallet" />
              {/* Only floats received and expenses recorded: the admin's
                  transfers to this person, and what was spent from them. */}
              <Tab value="expense" label="Expense wallet" />
            </Tabs>,
          )}
          <LedgerTable
            entries={entries}
            loading={ledger.loading}
            error={ledger.error}
            bare
            onDecide={decide}
            deciding={deciding}
          />
        </Panel>
      ) : isLab(user) ? (
        <Panel
          /* The pager belongs to the ledger. The statements table carries its
             own, and a footer holding both would page whichever was hidden. */
          footer={
            tab === 'account' ? (
              <Pager
                meta={{
                  page,
                  per_page: perPage,
                  total,
                  total_pages: Math.max(1, Math.ceil(total / perPage)),
                }}
                onPage={setPage}
                onPerPage={(n) => {
                  setPerPage(n);
                  setPage(1);
                }}
              />
            ) : undefined
          }
        >
          {/* The filters are only over the account: the commission statements
              are periods already, billed one at a time, and a date range over
              them would be a second way to choose the same thing. */}
          {header(
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab value="account" label="Your account" />
              <Tab value="statements" label="Commission statements" />
            </Tabs>,
            tab === 'account',
          )}

          {tab === 'account' && (
            <LedgerTable
              entries={entries}
              loading={ledger.loading}
              error={ledger.error}
              bare
              onDecide={decide}
              deciding={deciding}
            />
          )}
          {tab === 'statements' && <StatementsTable />}
        </Panel>
      ) : (
        <LedgerTable
          entries={entries}
          loading={ledger.loading}
          error={ledger.error}
          onDecide={decide}
          deciding={deciding}
          actions={
            <>
              {outgoings}
              {statement}
            </>
          }
          filters={filters}
          title={isSuper(user) ? 'Wallet' : 'Your account'}
          footer={
            <Pager
              meta={{
                page,
                per_page: perPage,
                total,
                total_pages: Math.max(1, Math.ceil(total / perPage)),
              }}
              onPage={setPage}
              onPerPage={(n) => {
                setPerPage(n);
                setPage(1);
              }}
            />
          }
        />
      )}

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Credits are money received, debits money sent on. The balance is the running total after
          each approved movement; declined and pending rows appear so the history is complete but
          leave it unchanged.
        </Typography>
      </Box>

      {kind && (
        <Dialog
          title={kind === 'expense' ? 'Add Expense' : 'Send to Admin'}
          onClose={() => setKind(null)}
          onSubmit={submit}
          submitLabel={kind === 'expense' ? 'Add expense' : 'Send'}
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
