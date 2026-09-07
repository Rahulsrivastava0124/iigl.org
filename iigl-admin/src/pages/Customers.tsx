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
import { useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import {
  IconAction,
  Pager,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
  money,
} from '../components/ui';
import OpenIcon from '@mui/icons-material/VisibilityOutlined';
import type { Paged } from '../lib/api';

type Tab = 'all' | 'registered' | 'unregistered';

const TABS: Array<{ id: Tab; label: string; note: string; adminOnly?: boolean }> = [
  {
    id: 'all',
    label: 'All Customers',
    // Head office's list spans the network, and the GST split is not how it
    // reads it: "who has ordered from us" is one question, and answering it
    // meant paging two screens and adding them up.
    adminOnly: true,
    note: 'Everybody who has ordered, registered or not.',
  },
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
];

interface Customer {
  mobile: string;
  customer_name: string | null;
  email: string | null;
  gst: string | null;
  address: string | null;
  orders: number;
  last_order: string | null;
  /** Every laboratory this number has ordered from, named and comma-separated. */
  laboratories: string | null;
  /** Summed over every order under the number. `due` is billed less paid. */
  billed: number;
  paid: number;
  due: number;
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

  const { user } = useAuth();
  const admin = isSuper(user);

  /* All Customers is head office's: its list spans the network. A laboratory
     sees the two GST tabs, which is the only distinction its own data draws. */
  const tabs = TABS.filter((t) => admin || !t.adminOnly);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  /*
    All Customers has no view control.

    That page is one customer's orders, and this tab is the network's list: the
    same number can have ordered from two laboratories, so what it would open is
    a history assembled across franchises rather than the one anybody came from.
    The Registered and Not-Registered tabs keep it.
  */
  const canView = current.id !== 'all';

  // The term is component state rather than another URL parameter: `setPage`
  // and `setTab` below rewrite the whole query string, and a third value in it
  // would have to be threaded through both.
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());

  const source = useFetch<Paged<Customer>>(`/customers/${current.id}?${query}`);
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

  return (
    <>
      <Tabs
        value={current.id}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((t) => (
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
                <TableCell>Name</TableCell>
                <TableCell>Mobile</TableCell>
                {/* Whose customer this is. Head office reads across the
                    network; a laboratory's list is its own by definition. */}
                {admin && <TableCell>Laboratory</TableCell>}
                <TableCell>Email</TableCell>
                <TableCell>GST</TableCell>
                <TableCell align="right">Orders</TableCell>
                <TableCell align="right">Total amount</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Due</TableCell>
                <TableCell>Last order</TableCell>
                {canView && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.mobile} hover>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 160 }}>
                    {r.customer_name || '—'}
                  </TableCell>
                  <TableCell className="mono">{r.mobile}</TableCell>
                  {admin && (
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                      {r.laboratories || '—'}
                    </TableCell>
                  )}
                  <TableCell>{r.email ?? '—'}</TableCell>
                  <TableCell className="mono">{r.gst ?? '—'}</TableCell>
                  <TableCell align="right" className="tabular">
                    {r.orders}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(r.billed ?? 0)}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(r.paid ?? 0)}
                  </TableCell>
                  {/* Amber only while something is owed. */}
                  <TableCell
                    align="right"
                    className="tabular"
                    sx={{ color: (r.due ?? 0) > 0 ? 'warning.main' : undefined }}
                  >
                    {money(r.due ?? 0)}
                  </TableCell>
                  <TableCell>{r.last_order ?? '—'}</TableCell>
                  {canView && (
                    <TableCell>
                      {/* What they have ordered, and what it came to. The list
                          can only say how many and when. */}
                      <RowActions>
                        <IconAction
                          label="Orders and totals"
                          icon={OpenIcon}
                          to={`/customers/${encodeURIComponent(r.mobile)}`}
                        />
                      </RowActions>
                    </TableCell>
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
