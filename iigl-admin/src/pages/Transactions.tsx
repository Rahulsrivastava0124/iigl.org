import { useState } from 'react';
import {
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { Notice, PageHead, Pager, Panel, StatusChip, TableFrame, money } from '../components/ui';
import type { Paged, Transaction } from '../lib/api';

export default function Transactions() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (status !== '') query.set('status', status);

  const { data, loading, error: loadError, reload } = useFetch<Paged<Transaction>>(
    `/transactions?${query}`,
  );
  const rows = data?.data ?? [];

  const decide = async (id: number, next: 1 | 2) => {
    setBusyId(id);
    setError(null);
    setDone(null);
    try {
      await api.post(`/transactions/${id}/status`, { status: next });
      setDone(next === 1 ? 'Transaction approved.' : 'Transaction declined.');
      reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHead
        title="Transactions"
        subtitle={`${
          data ? `${data.meta.total.toLocaleString()} records` : 'Loading…'
        } · you can decide only what was sent to you`}
      />

      {done && <Notice kind="ok">{done}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <Panel
        actions={
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="0">Pending</MenuItem>
            <MenuItem value="1">Approved</MenuItem>
            <MenuItem value="2">Declined</MenuItem>
          </TextField>
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
                const mine = t.received_by === user?.id || user?.roleId === 1;
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
                        <Stack direction="row" spacing={0.5}>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={busyId === t.id}
                            onClick={() => decide(t.id, 1)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            disabled={busyId === t.id}
                            onClick={() => decide(t.id, 2)}
                          >
                            Decline
                          </Button>
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
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>
    </>
  );
}
