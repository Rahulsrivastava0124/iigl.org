import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { useFetch, useDebounced } from '../lib/useFetch';
import { fileUrl } from '../lib/config';
import {
  IconAction,
  Pager,
  Panel,
  RowActions,
  SearchField,
  StatusChip,
  TableFrame,
  money,
} from '../components/ui';
import type { Paged, Transaction } from '../lib/api';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';

interface Wallet {
  received: number;
  sent: number;
  balance: number;
}

/**
 * The wallet: the commission the head office has been paid.
 *
 * Ported from `Admin\DashboardController@admin_wallet`, which lists
 * `transactions` where `transaction_type = 'commision'` and `status = 1`,
 * newest first — the same rows the "Current wallet" figure on the dashboard is
 * the sum of. Reached from that figure, as it was in the Laravel panel.
 */
export default function Wallet() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({
    page: String(page),
    per_page: '25',
    type: 'commision',
    status: '1',
  });
  if (term.trim()) query.set('q', term.trim());

  const { data, loading, error } = useFetch<Paged<Transaction>>(`/transactions?${query}`);
  const balance = useFetch<{ data: Wallet }>('/transactions/wallet');
  const rows = data?.data ?? [];

  return (
    <Panel
      title="Wallet"
      subtitle={balance.data ? `${money(balance.data.data.balance)} balance` : undefined}
      count={
        loading ? 'Loading…' : `${(data?.meta.total ?? 0).toLocaleString()} commission credits`
      }
      actions={
        <SearchField
          placeholder="Transaction no, remark, mode…"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
      }
    >
      <TableFrame loading={loading} error={error} empty={rows.length === 0}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Sent by</TableCell>
              {/*
                The Laravel view had these two headings the wrong way round —
                "Commision for(₹)" printed `amount` and "Amount" printed
                `comission_on`. `comission_on` is the sale the commission was
                worked out from and `amount` is the commission itself, so the
                headings are kept and the values put under the right ones.
              */}
              <TableCell align="right">Commission for</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Mode</TableCell>
              <TableCell>Transaction no.</TableCell>
              <TableCell>Remark</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Attachment</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{String(t.created_at ?? '').slice(0, 10) || '—'}</TableCell>
                <TableCell>{t.send_by_name ?? `#${t.send_by}`}</TableCell>
                <TableCell align="right" className="tabular">
                  {money(t.comission_on)}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(t.amount)}
                </TableCell>
                <TableCell>{t.pay_mode ?? '—'}</TableCell>
                <TableCell className="mono">{t.transaction_no ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>
                  {t.remark ?? '—'}
                </TableCell>
                <TableCell>
                  <StatusChip status={t.status} />
                </TableCell>
                <TableCell>
                  {t.attachment ? (
                    <RowActions>
                      <IconAction
                        label="Open attachment"
                        icon={DownloadIcon}
                        to={fileUrl(t.attachment) ?? undefined}
                      />
                    </RowActions>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      <Pager meta={data?.meta} onPage={setPage} />
    </Panel>
  );
}
