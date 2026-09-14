import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Checkbox, Stack, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import EditIcon from '@mui/icons-material/EditOutlined';
import { useToast } from './Toast';
import { IconAction, Panel, RowActions, SearchField, TableFrame } from './ui';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { fileUrl } from '../lib/config';

interface Customer {
  id: number;
  company_name: string;
  owner_name: string;
  mobile: string;
  area: string | null;
  city: string | null;
  state: string | null;
  logo: string | null;
  show_on_site: number;
  laboratory: string | null;
}

/**
 * Website Setup › Customers: the registered customers, and which the website's
 * Our Registered Customers section lists.
 *
 * A registered customer is listed by default (migration 060); untick one here
 * to take it off the website. The tick saves the moment it changes, the row
 * moves at once, and goes back only if the server refuses.
 *
 * What the card shows — logo, area, city, state — is edited on the customer's
 * own record, which the pencil opens.
 */
export default function WebsiteCustomers() {
  const toast = useToast();
  const navigate = useNavigate();
  const source = useFetch<{ data: Customer[] }>('/content/website-customers');
  const [local, setLocal] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const all = source.data?.data ?? [];
  const shown = (c: Customer) => local[c.id] ?? !!c.show_on_site;
  const q = search.trim().toLowerCase();
  const rows = q
    ? all.filter((c) =>
        [c.company_name, c.owner_name, c.mobile, c.area, c.city, c.state, c.laboratory].some((f) =>
          f?.toLowerCase().includes(q),
        ),
      )
    : all;
  const allShown = rows.length > 0 && rows.every(shown);

  const setShown = async (ids: number[], value: boolean) => {
    const before = local;
    setLocal((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, value])) }));
    setSaving(true);
    try {
      await Promise.all(ids.map((id) => api.patch(`/content/website-customers/${id}`, { show_on_site: value })));
      toast.ok(value ? 'Shown on the website.' : 'Hidden from the website.');
      await source.reload();
      setLocal({});
    } catch (e) {
      setLocal(before);
      toast.error(messageOf(e));
      source.reload();
    } finally {
      setSaving(false);
    }
  };

  const place = (c: Customer) => [c.area, c.city].filter(Boolean).join(', ') || '—';

  return (
    <Panel
      title="Customers"
      count={source.loading ? 'Loading…' : `${rows.length} of ${all.length} · ${all.filter(shown).length} shown`}
      actions={<SearchField value={search} onChange={setSearch} />}
    >
      <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Company</TableCell>
              <TableCell>Contact No.</TableCell>
              <TableCell>Area, City</TableCell>
              <TableCell>State</TableCell>
              <TableCell>Laboratory</TableCell>
              <TableCell padding="checkbox" sx={{ whiteSpace: 'nowrap', pr: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Checkbox
                    size="small"
                    sx={{
                      p: 0,
                      color: 'common.white',
                      '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: 'common.white' },
                      '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.45)' },
                    }}
                    checked={allShown}
                    indeterminate={!allShown && rows.some(shown)}
                    disabled={saving || rows.length === 0}
                    onChange={() => setShown(rows.map((c) => c.id), !allShown)}
                    slotProps={{ input: { 'aria-label': 'Show every listed customer on the website' } }}
                  />
                  <span>Show on website</span>
                </Stack>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id} hover selected={shown(c)}>
                <TableCell sx={{ width: 52 }}>
                  <Avatar
                    variant="rounded"
                    src={fileUrl(c.logo) ?? undefined}
                    alt=""
                    slotProps={{ img: { sx: { objectFit: 'contain' } } }}
                    sx={{ width: 32, height: 32, bgcolor: 'action.hover', color: 'text.secondary', fontSize: 13 }}
                  >
                    {c.company_name.trim().charAt(0).toUpperCase()}
                  </Avatar>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>{c.company_name}</TableCell>
                <TableCell className="mono">{c.mobile}</TableCell>
                <TableCell>{place(c)}</TableCell>
                <TableCell>{c.state || '—'}</TableCell>
                <TableCell>{c.laboratory || 'Super Admin'}</TableCell>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    sx={{ p: 0 }}
                    checked={shown(c)}
                    disabled={saving}
                    onChange={() => setShown([c.id], !shown(c))}
                    slotProps={{ input: { 'aria-label': `Show ${c.company_name} on the website` } }}
                  />
                </TableCell>
                <TableCell>
                  <RowActions>
                    <IconAction
                      label="Edit logo, area and state"
                      icon={EditIcon}
                      onClick={() => navigate(`/customers/${c.id}/edit`)}
                    />
                  </RowActions>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </Panel>
  );
}
