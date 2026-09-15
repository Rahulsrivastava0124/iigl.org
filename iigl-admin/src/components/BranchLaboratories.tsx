import { useState } from 'react';
import { Avatar, Checkbox, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip } from '@mui/material';
import { useToast } from './Toast';
import EditIcon from '@mui/icons-material/EditOutlined';
import { IconAction, Panel, SearchField, StateChip, TableFrame } from './ui';
import { useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { fileUrl } from '../lib/config';

interface Lab {
  id: number;
  empid: string | null;
  fullname: string;
  city: string | null;
  state: string | null;
  is_active: number;
  show_on_site: number;
  company_logo: string | null;
  /** How the website map places it — see GET /content/branch-laboratories. */
  map_location: 'city' | 'state' | 'pending' | 'none';
}

/** The Map column: where the pin will go, and what to do when it is not the city. */
function MapLocation({ lab }: { lab: Lab }) {
  switch (lab.map_location) {
    case 'city':
      return <StateChip tone="settled" label="On city" />;
    case 'pending':
      return <StateChip tone="waiting" label="Locating…" />;
    case 'state':
      return (
        <Tooltip title={`“${lab.city}” was not found, so the pin sits in the middle of ${lab.state || 'the state'}. Check the city's spelling on the laboratory's record.`}>
          <span>
            <StateChip tone="refused" label="City not found" />
          </span>
        </Tooltip>
      );
    default:
      return (
        <Tooltip title="No city on the laboratory's record. Add one to place it on the map.">
          <span>
            <StateChip tone="refused" label="No city" />
          </span>
        </Tooltip>
      );
  }
}

/**
 * Website Setup › Branches: the laboratories, and which the website lists.
 *
 * The website's branches are the laboratory network, so this is the list of
 * laboratories with one tick each. The tick saves the moment it changes — there
 * is no Save button to forget — and the row moves at once, going back only if
 * the server refuses.
 *
 * The website places each laboratory on its map by the city on its record.
 *
 * An inactive laboratory is never shown on the site whatever its tick says; it
 * is listed here, marked Inactive, so a closed branch still ticked is visible.
 */
export default function BranchLaboratories({ readOnly = false }: { /** Seen, not changed: no Edit on Website Setup. */ readOnly?: boolean } = {}) {
  const superAdmin = isSuper(useAuth().user);
  const toast = useToast();
  const source = useFetch<{ data: Lab[] }>('/content/branch-laboratories');
  // Ticks changed on screen, ahead of the reload that confirms them.
  const [local, setLocal] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const all = source.data?.data ?? [];
  const shown = (l: Lab) => local[l.id] ?? !!l.show_on_site;
  const q = search.trim().toLowerCase();
  const rows = q
    ? all.filter((l) => [l.fullname, l.empid, l.city, l.state].some((f) => f?.toLowerCase().includes(q)))
    : all;

  const allShown = rows.length > 0 && rows.every(shown);

  const setShown = async (ids: number[], value: boolean) => {
    const before = local;
    setLocal((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, value])) }));
    setSaving(true);
    try {
      await Promise.all(ids.map((id) => api.patch(`/content/branch-laboratories/${id}`, { show_on_site: value })));
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

  return (
    <Panel
      title="Branches"
      count={source.loading ? 'Loading…' : `${rows.length} of ${all.length} · ${all.filter(shown).length} shown`}
      actions={<SearchField value={search} onChange={setSearch} />}
    >
      <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Laboratory</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>City</TableCell>
              <TableCell>State</TableCell>
              <TableCell>Map</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
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
                    disabled={readOnly || saving || rows.length === 0}
                    onChange={() => setShown(rows.map((l) => l.id), !allShown)}
                    slotProps={{ input: { 'aria-label': 'Show every listed laboratory on the website' } }}
                  />
                  <span>Show on website</span>
                </Stack>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.id} hover selected={shown(l)}>
                <TableCell sx={{ width: 52 }}>
                  <Avatar
                    variant="rounded"
                    src={fileUrl(l.company_logo) ?? undefined}
                    alt=""
                    slotProps={{ img: { sx: { objectFit: 'contain' } } }}
                    sx={{ width: 32, height: 32, bgcolor: 'action.hover', color: 'text.secondary', fontSize: 13 }}
                  >
                    {l.fullname.charAt(0).toUpperCase()}
                  </Avatar>
                </TableCell>
                <TableCell>{l.fullname}</TableCell>
                <TableCell className="mono">{l.empid || '—'}</TableCell>
                <TableCell>{l.city || '—'}</TableCell>
                <TableCell>{l.state || '—'}</TableCell>
                <TableCell>{shown(l) ? <MapLocation lab={l} /> : '—'}</TableCell>
                <TableCell>
                  <StateChip tone={l.is_active ? 'settled' : 'refused'} label={l.is_active ? 'Active' : 'Inactive'} />
                </TableCell>
                <TableCell sx={{ width: 48 }}>
                  {/* The branch's own page — banner, content, gallery, links. Head office only. */}
                  {superAdmin && <IconAction label="Edit website page" icon={EditIcon} to={`/site/${l.id}`} />}
                </TableCell>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    sx={{ p: 0 }}
                    checked={shown(l)}
                    disabled={readOnly || saving}
                    onChange={() => setShown([l.id], !shown(l))}
                    slotProps={{ input: { 'aria-label': `Show ${l.fullname} on the website` } }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </Panel>
  );
}
