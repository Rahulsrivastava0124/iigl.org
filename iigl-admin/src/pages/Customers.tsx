import { useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Typography,
  Stack,
} from '@mui/material';
import { useFetch, useDebounced } from '../lib/useFetch';
import { messageOf, useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { isSuper } from '../lib/portal';
import { fileUrl } from '../lib/config';
import { usePermissions } from '../lib/permissions';
import {
  IconAction,
  DEFAULT_PER_PAGE, Pager,
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
  /** The laboratory a stored account is registered with. Null: Super Admin's own. */
  lab_id?: number | null;
  company_name?: string | null;
  owner_name?: string | null;
  /** The mark on their card, the same one the website shows. */
  logo?: string | null;
  /** Listed on the website. Null for a customer known only from orders: no record to list. */
  show_on_site?: boolean | null;
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
  /** Rows per page. Component state, not a URL parameter: it is how somebody
   * likes to read a list, not which list they are looking at. */
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const { user } = useAuth();
  const { can, headOffice } = usePermissions();
  // Head office and its staff read the network's customers; the tabs and the
  // Laboratory column follow that, not the account's role alone.
  const admin = isSuper(user) || headOffice;

  /* All Customers is head office's: its list spans the network. A laboratory
     sees the two GST tabs, which is the only distinction its own data draws. */
  const tabs = TABS.filter((t) => admin || !t.adminOnly);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  /*
    The view control on every tab, All Customers included.

    That page is one customer's orders. On the network list the same number can
    have ordered from more than one laboratory, so what it opens is a history
    assembled across franchises — head office's `/customers/:mobile/orders`
    returns exactly that, with the Laboratory column naming each. Withholding it
    on All Customers left head office, whose list this is, unable to open the
    orders — and the order behind them — from the one tab it lives on.
  */
  const canView = true;
  const registered = current.id === 'registered';
  // Granted like everything else about customers: a laboratory and head office
  // always may, staff when they have been given it.
  const mayRegister = registered && can('customer', 'create');
  /*
    Edit on every row, on every tab. A stored account opens its own record; a
    customer known only from their orders has none yet, so Edit opens the
    registration form filled from those orders — saving creates the record, and
    the orders already billed are left exactly as they were.
  */
  const mayEdit = can('customer', 'update');
  const mayCreate = can('customer', 'create');
  const navigate = useNavigate();

  // The term is component state rather than another URL parameter: `setPage`
  // and `setTab` below rewrite the whole query string, and a third value in it
  // would have to be threaded through both.
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
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

  /*
    The "Website" tick: whether the website's Our Registered Customers section
    lists this customer. Saved the moment it changes; the box moves at once and
    goes back only if the server refuses.
  */
  const toast = useToast();
  const [onSite, setOnSite] = useState<Record<number, boolean>>({});
  const [savingSite, setSavingSite] = useState<number | null>(null);
  const shownOnSite = (r: Customer) => (r.account_id ? (onSite[r.account_id] ?? Boolean(r.show_on_site)) : false);
  const toggleSite = async (r: Customer) => {
    if (!r.account_id) return;
    const id = r.account_id;
    const next = !shownOnSite(r);
    setOnSite((m) => ({ ...m, [id]: next }));
    setSavingSite(id);
    try {
      await api.patch(`/customers/accounts/${id}`, { show_on_site: next });
      toast.ok(next ? `${r.company_name} is shown on the website.` : `${r.company_name} is hidden from the website.`);
    } catch (e) {
      setOnSite((m) => ({ ...m, [id]: !next }));
      toast.error(messageOf(e));
    } finally {
      setSavingSite(null);
    }
  };


  /*
    A customer known only from their orders has no record to publish. The
    website's card is a company, a logo and a place, and an order carries none
    of them — so the column offers registration, the same prefilled form Edit
    opens, rather than a tick that would list a blank card.
  */
  const registerFrom = (r: Customer) =>
    navigate('/customers/new', {
      state: {
        prefill: {
          company_name: r.customer_name ?? '',
          owner_name: r.customer_name ?? '',
          mobile: r.mobile,
          email: r.email ?? '',
          gst_no: r.gst ?? '',
        },
      },
    });

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
        footer={<Pager meta={source.data?.meta} onPage={setPage} onPerPage={(n) => {
            setPerPage(n);
            setPage(1);
          }} />}
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
                {registered && <TableCell align="center">Show on website</TableCell>}
                {(canView || mayEdit || mayCreate) && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                // Keyed by account and number together: head office can see the
                // same mobile registered with two laboratories.
                <TableRow key={`${r.account_id ?? 'order'}-${r.mobile}`} hover>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 160 }}>
                    {registered && r.company_name ? (
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                        {/* Their own mark where they have one, their initial
                            where they have not: the column keeps one shape
                            either way, so the names still line up. */}
                        <Avatar
                          src={fileUrl(r.logo) ?? undefined}
                          alt=""
                          variant="rounded"
                          sx={{ width: 48, height: 48, fontSize: 18, bgcolor: 'action.hover', color: 'text.secondary' }}
                        >
                          {r.company_name.trim().charAt(0).toUpperCase()}
                        </Avatar>
                        <span>
                          <Typography component="span" sx={{ display: 'block', fontWeight: 600, fontSize: 'inherit' }}>
                            {r.company_name}
                          </Typography>
                          <Typography component="span" variant="caption" color="text.secondary">
                            {r.owner_name}
                          </Typography>
                        </span>
                      </Stack>
                    ) : (
                      r.customer_name || '—'
                    )}
                  </TableCell>
                  <TableCell className="mono">{r.mobile}</TableCell>
                  {admin && (
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                      {r.laboratories ||
                        // A stored account with no laboratory was created by
                        // Super Admin as its own.
                        (r.account_id && r.lab_id == null ? 'Super Admin' : '—')}
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
                  {/* The figure the list is read for, so it carries the weight;
                      amber only while something is owed. */}
                  <TableCell
                    align="right"
                    className="tabular"
                    sx={{ fontWeight: 600, color: (r.due ?? 0) > 0 ? 'warning.main' : undefined }}
                  >
                    {money(r.due ?? 0)}
                  </TableCell>
                  {registered && (
                    <TableCell align="center" padding="checkbox">
                      {r.account_id ? (
                        <Checkbox
                          size="small"
                          sx={{ p: 0 }}
                          checked={shownOnSite(r)}
                          disabled={!mayEdit || savingSite === r.account_id}
                          onChange={() => toggleSite(r)}
                          slotProps={{ input: { 'aria-label': `Show ${r.company_name} on the website` } }}
                        />
                      ) : mayCreate ? (
                        // Known only from orders: registering them is what gives
                        // the website something to show, so say so here.
                        <Button size="small" sx={{ minWidth: 0, px: 1 }} onClick={() => registerFrom(r)}>
                          Register
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  )}
                  {(canView || mayEdit || mayCreate) && (
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
                        {r.account_id
                          ? mayEdit && (
                              <IconAction
                                label="Edit customer"
                                icon={EditIcon}
                                to={`/customers/${r.account_id}/edit`}
                              />
                            )
                          : mayCreate && (
                              <IconAction
                                label="Edit customer"
                                icon={EditIcon}
                                onClick={() => registerFrom(r)}
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
