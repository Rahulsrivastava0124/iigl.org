import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Button,
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
import { usePermissions } from '../lib/permissions';
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
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
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
    note: 'Customers registered here, and anybody who gave a GST number on an order.',
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
  /*
    The Register tab only. A stored account carries its own id, company and
    owner; a GST customer known only from an order has neither yet, and
    `account_id` is null.
  */
  account_id?: number | null;
  company_name?: string | null;
  owner_name?: string | null;
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
  const { can } = usePermissions();

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
  const registered = current.id === 'registered';
  // Granted like everything else about customers: a laboratory and head office
  // always may, staff when they have been given it.
  const mayRegister = registered && can('customer', 'create');
  const mayEdit = registered && can('customer', 'update');

  // The term is component state rather than another URL parameter: `setPage`
  // and `setTab` below rewrite the whole query string, and a third value in it
  // would have to be threaded through both.
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());

  /*
    The Register tab reads the merged list — stored accounts, plus GST customers
    known only from their orders — so somebody registered this morning is on it
    before they have ordered anything. The other two tabs are unchanged views
    over orders.
  */
  const source = useFetch<Paged<Customer>>(
    `/customers/${registered ? 'accounts' : current.id}?${query}`,
  );
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
          <>
            <SearchField
              placeholder={registered ? 'Company, owner, mobile…' : 'Name, mobile, email…'}
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            {mayRegister && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                component={RouterLink}
                to="/customers/new"
              >
                Add Registered Customer
              </Button>
            )}
          </>
        }
      >
        <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>{registered ? 'Company / Owner' : 'Name'}</TableCell>
                <TableCell>Mobile</TableCell>
                {/* Whose customer this is. Head office reads across the
                    network; a laboratory's list is its own by definition. */}
                {admin && <TableCell>Laboratory</TableCell>}
                {/* Not on the Register tab: a registered customer's email, GST
                    and terms are on their own record, behind Edit. The other
                    two tabs keep Email and GST. */}
                {!registered && <TableCell>Email</TableCell>}
                {!registered && <TableCell>GST</TableCell>}
                <TableCell align="right">Orders</TableCell>
                <TableCell align="right">Total amount</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Due</TableCell>
                <TableCell>Last order</TableCell>
                {(canView || mayEdit) && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                // Keyed by account and number together: head office can see the
                // same mobile registered with two laboratories.
                <TableRow key={`${r.account_id ?? 'order'}-${r.mobile}`} hover>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 160 }}>
                    {registered && r.company_name ? (
                      <>
                        <Typography component="span" sx={{ display: 'block', fontWeight: 600, fontSize: 'inherit' }}>
                          {r.company_name}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary">
                          {r.owner_name}
                        </Typography>
                      </>
                    ) : (
                      r.customer_name || '—'
                    )}
                  </TableCell>
                  <TableCell className="mono">{r.mobile}</TableCell>
                  {admin && (
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                      {r.laboratories || '—'}
                    </TableCell>
                  )}
                  {!registered && <TableCell>{r.email ?? '—'}</TableCell>}
                  {!registered && <TableCell className="mono">{r.gst ?? '—'}</TableCell>}
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
                  {(canView || mayEdit) && (
                    <TableCell>
                      {/* What they have ordered, and what it came to. The list
                          can only say how many and when. */}
                      <RowActions>
                        {canView && (
                          <IconAction
                            label="Orders and totals"
                            icon={OpenIcon}
                            to={`/customers/${encodeURIComponent(r.mobile)}`}
                          />
                        )}
                        {/* Only a stored account has a record to edit. A GST
                            customer known from an order has nothing to open. */}
                        {mayEdit && r.account_id && (
                          <IconAction
                            label="Edit customer and discount"
                            icon={EditIcon}
                            to={`/customers/${r.account_id}/edit`}
                          />
                        )}
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
        {current.note}{' '}
        {registered
          ? 'A registered customer is a record of its own; the rest are drawn from orders and grouped by mobile number.'
          : 'There is no customer record of its own — a customer is whoever has placed an order, so these are drawn from the orders themselves and grouped by mobile number.'}
      </Typography>
    </>
  );
}
