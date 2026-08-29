import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch, useDebounced } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import {
  Pager,
  Panel,
  SearchField,
  StatusChip,
  TableFrame,
  Tile,
  ToneAction,
  money,
} from '../components/ui';
import type { Paged, Transaction } from '../lib/api';
import { isSuper } from '../lib/portal';
import ApproveIcon from '@mui/icons-material/CheckCircleOutlined';
import DeclineIcon from '@mui/icons-material/CancelOutlined';

/** One line of the running account, as /transactions/ledger returns it. */
interface LedgerEntry {
  id: number;
  date: string | null;
  type: string | null;
  direction: 'credit' | 'debit';
  amount: number;
  status: number;
  order_id: number | null;
  transaction_no: string | null;
  remark: string | null;
  balance: number;
}

interface LedgerPage {
  entries: LedgerEntry[];
  credit_total: number;
  debit_total: number;
  balance: number;
  pending_out: number;
  pending_in: number;
  total: number;
}

export default function Transactions() {
  const toast = useToast();
  const { user } = useAuth();

  // The menu points here three ways: the history, the pending queue awaiting a
  // decision, and the running account. The URL says which.
  const [params, setParams] = useSearchParams();
  const ledgerView = params.get('view') === 'ledger';

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (status !== '') query.set('status', status);
  if (term.trim()) query.set('q', term.trim());

  const { data, loading, error: loadError, reload } = useFetch<Paged<Transaction>>(
    ledgerView ? null : `/transactions?${query}`,
  );
  const ledger = useFetch<{ data: LedgerPage }>(
    ledgerView ? `/transactions/ledger?page=${page}&per_page=100` : null,
  );
  const rows = data?.data ?? [];
  const account = ledger.data?.data;
  const entries = account?.entries ?? [];

  const decide = async (id: number, next: 1 | 2) => {
    setBusyId(id);
    try {
      await api.post(`/transactions/${id}/status`, { status: next });
      toast.ok(next === 1 ? 'Transaction approved.' : 'Transaction declined.');
      reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>

      {ledgerView ? (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Tile label="Balance" value={money(account?.balance ?? 0)} />
            <Tile label="Received" value={money(account?.credit_total ?? 0)} />
            <Tile label="Sent" value={money(account?.debit_total ?? 0)} />
            <Tile label="Awaiting approval" value={money(account?.pending_out ?? 0)} />
          </Stack>

          <Panel title="Ledger">
            <TableFrame
              loading={ledger.loading}
              error={ledger.error}
              empty={entries.length === 0}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Remark</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Credit</TableCell>
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id} hover>
                      <TableCell>{e.date?.slice(0, 10) ?? '—'}</TableCell>
                      <TableCell className="mono">{e.transaction_no ?? `#${e.id}`}</TableCell>
                      <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>
                        {e.remark ?? e.type ?? '—'}
                      </TableCell>
                      <TableCell>
                        <StatusChip status={e.status} />
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {e.direction === 'credit' ? money(e.amount) : '—'}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {e.direction === 'debit' ? money(e.amount) : '—'}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {money(e.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          </Panel>
        </>
      ) : (
      <Panel
        footer={<Pager meta={data?.meta} onPage={setPage} />}
        title={status === '0' ? 'Commission approval' : 'Commission history'}
        count={data ? `${data.meta.total.toLocaleString()} records` : 'Loading…'}
        actions={
          <>
          <SearchField
            placeholder="Transaction no, remark, mode…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
              setParams(e.target.value === '' ? {} : { status: e.target.value });
            }}
            sx={{ width: 150 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="0">Pending</MenuItem>
            <MenuItem value="1">Approved</MenuItem>
            <MenuItem value="2">Declined</MenuItem>
          </TextField>
          </>
        }
      >
        <TableFrame loading={loading} error={loadError} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell>Mode</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((t) => {
                const mine = t.received_by === user?.id || isSuper(user);
                const pending = t.status === 0;
                return (
                  <TableRow key={t.id} hover>
                    <TableCell className="mono">#{t.id}</TableCell>
                    <TableCell>{t.transaction_type ?? '—'}</TableCell>
                    <TableCell align="right" className="tabular">
                      {money(t.amount)}
                    </TableCell>
                    <TableCell>{t.send_by === 0 ? 'customer' : `#${t.send_by}`}</TableCell>
                    <TableCell>#{t.received_by}</TableCell>
                    <TableCell>{t.pay_mode}</TableCell>
                    <TableCell className="mono">{t.transaction_no ?? '—'}</TableCell>
                    <TableCell>
                      <StatusChip status={t.status} />
                    </TableCell>
                    <TableCell>
                      {pending && mine ? (
                        <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
                          <ToneAction
                            label="Approve"
                            icon={ApproveIcon}
                            tone="settled"
                            disabled={busyId === t.id}
                            onClick={() => decide(t.id, 1)}
                          />
                          <ToneAction
                            label="Decline"
                            icon={DeclineIcon}
                            tone="refused"
                            disabled={busyId === t.id}
                            onClick={() => decide(t.id, 2)}
                          />
                        </Stack>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>
      )}
    </>
  );
}
