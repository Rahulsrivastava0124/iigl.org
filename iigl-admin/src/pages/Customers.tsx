import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useFetch, useDebounced } from '../lib/useFetch';
import { Pager, Panel, SearchField, TableFrame } from '../components/ui';
import type { Paged } from '../lib/api';

type Tab = 'registered' | 'unregistered' | 'verifiers';

const TABS: Array<{ id: Tab; label: string; note: string }> = [
  {
    id: 'registered',
    label: 'Register Customer',
    note: 'Customers who gave a GST number.',
  },
  {
    id: 'unregistered',
    label: 'Not-Register Customer',
    note: 'Customers with no GST number on any order.',
  },
  {
    id: 'verifiers',
    label: 'Verifier Customer',
    note: 'People who looked up a certificate on the public site. The verification form never asked for a name, so all 2,142 rows carry only a number.',
  },
];

interface Customer {
  mobile: string;
  customer_name: string | null;
  email: string | null;
  gst: string | null;
  address: string | null;
  orders: number;
  last_order: string | null;
}

interface Verifier {
  mobile: string;
  fullname: string | null;
  lookups: number;
  last_lookup: string | null;
}

/**
 * There is no customer table. A customer is whoever has placed an order, so
 * these are views over `orders` grouped by mobile number — the same way the
 * Laravel application draws them.
 */
export default function Customers() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'registered';
  const page = Number(params.get('page') ?? 1);

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  // The term is component state rather than another URL parameter: `setPage`
  // and `setTab` below rewrite the whole query string, and a third value in it
  // would have to be threaded through both.
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());

  const source = useFetch<Paged<Customer & Verifier>>(`/customers/${current.id}?${query}`);
  const rows = source.data?.data ?? [];

  const setTab = (next: Tab) => setParams(next === 'registered' ? {} : { tab: next });
  const setPage = (next: number) =>
    setParams(
      next === 1
        ? tab === 'registered'
          ? {}
          : { tab }
        : tab === 'registered'
          ? { page: String(next) }
          : { tab, page: String(next) },
    );

  const verifiers = current.id === 'verifiers';

  return (
    <>
      <Tabs
        value={current.id}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((t) => (
          <Tab key={t.id} value={t.id} label={t.label} />
        ))}
      </Tabs>

      <Panel
        footer={<Pager meta={source.data?.meta} onPage={setPage} />}
        title="Customers"
        count={source.data ? `${source.data.meta.total.toLocaleString()} people` : 'Loading…'}
        actions={
          <SearchField
            placeholder="Name, mobile, email…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
        }
      >
        <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {/* The verification form never captured a name, so that column
                    would be empty on every row. */}
                {!verifiers && <TableCell>Name</TableCell>}
                <TableCell>Mobile</TableCell>
                {verifiers ? (
                  <>
                    <TableCell align="right">Lookups</TableCell>
                    <TableCell>Last lookup</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>Email</TableCell>
                    <TableCell>GST</TableCell>
                    <TableCell align="right">Orders</TableCell>
                    <TableCell>Last order</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.mobile} hover>
                  {!verifiers && (
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 160 }}>
                      {r.customer_name || '—'}
                    </TableCell>
                  )}
                  <TableCell className="mono">{r.mobile}</TableCell>
                  {verifiers ? (
                    <>
                      <TableCell align="right" className="tabular">
                        {r.lookups}
                      </TableCell>
                      <TableCell>{r.last_lookup?.slice(0, 10) ?? '—'}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{r.email ?? '—'}</TableCell>
                      <TableCell className="mono">{r.gst ?? '—'}</TableCell>
                      <TableCell align="right" className="tabular">
                        {r.orders}
                      </TableCell>
                      <TableCell>{r.last_order ?? '—'}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        {current.note} There is no customer record of its own — a customer is whoever has placed an
        order, so these are drawn from the orders themselves and grouped by mobile number.
      </Typography>
    </>
  );
}
