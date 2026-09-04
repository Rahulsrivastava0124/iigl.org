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
import { LedgerTable, LedgerTotals, type LedgerPage } from '../components/Ledger';
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
  ToneAction,
  money,
} from '../components/ui';
import type { Paged, Transaction } from '../lib/api';
import { isSuper } from '../lib/portal';
import ApproveIcon from '@mui/icons-material/CheckCircleOutlined';
import DeclineIcon from '@mui/icons-material/CancelOutlined';

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
          <LedgerTotals account={account} />
          <LedgerTable
            entries={entries}
            loading={ledger.loading}
            error={ledger.error}
            count={account ? `${account.total.toLocaleString()} movements` : 'Loading…'}
          />
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
