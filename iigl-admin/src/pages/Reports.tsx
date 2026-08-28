import { useState } from 'react';
import {
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import { useFetch, useDebounced } from '../lib/useFetch';
import { IconAction, Pager, Panel, RowActions, SearchField, TableFrame } from '../components/ui';
import type { Paged, Report } from '../lib/api';
import { apiUrl } from '../lib/config';
import SmartIcon from '@mui/icons-material/CreditCardOutlined';
import ClassicIcon from '@mui/icons-material/DescriptionOutlined';

/** Opens a card PDF in a new tab. The API streams it inline. */
function printCard(id: number, kind: 'smart' | 'classic') {
  window.open(apiUrl(`/cards/${kind}/${id}`), '_blank', 'noopener');
}

export default function Reports() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);

  // Server-side: 22,000 certificates, 25 on screen.
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());

  const { data, loading, error } = useFetch<Paged<Report>>(`/reports?${query}`);
  const rows = data?.data ?? [];

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const toggleAll = () =>
    setSelected((s) =>
      allOnPage
        ? s.filter((id) => !rows.some((r) => r.id === id))
        : [...new Set([...s, ...rows.map((r) => r.id)])],
    );

  /**
   * Batch printing posts a list of ids, so it cannot be a plain link. The
   * response is a PDF, which is turned into a blob URL and opened.
   */
  const printBatch = async () => {
    const res = await fetch(apiUrl('/cards/smart'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_ids: selected }),
    });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank', 'noopener');
  };

  return (
    <>
      <Panel
        footer={<Pager meta={data?.meta} onPage={setPage} />}
        title="Certificates"
        count={data ? `${data.meta.total.toLocaleString()} issued` : 'Loading…'}
        actions={
          <>
            <SearchField
              placeholder="Certificate or order no…"
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <Typography variant="body2" color={selected.length > 50 ? 'error' : 'text.secondary'}>
              {selected.length} selected
              {selected.length > 50 && ' — the cap is 50 per print run'}
            </Typography>
            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              disabled={selected.length === 0 || selected.length > 50}
              onClick={printBatch}
            >
              Print smart cards
            </Button>
          </>
        }
      >
        <TableFrame loading={loading} error={error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allOnPage}
                    indeterminate={!allOnPage && rows.some((r) => selected.includes(r.id))}
                    onChange={toggleAll}
                    slotProps={{ input: { 'aria-label': 'Select every certificate on this page' } }}
                  />
                </TableCell>
                <TableCell>Certificate</TableCell>
                <TableCell>Order</TableCell>
                <TableCell align="right">Gross</TableCell>
                <TableCell align="right">Carat</TableCell>
                <TableCell>Issued</TableCell>
                <TableCell>Print</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover selected={selected.includes(r.id)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.includes(r.id)}
                      onChange={() => toggle(r.id)}
                      slotProps={{ input: { 'aria-label': `Select ${r.report_no}` } }}
                    />
                  </TableCell>
                  <TableCell className="mono">{r.report_no}</TableCell>
                  <TableCell className="mono">#{r.order_no}</TableCell>
                  <TableCell align="right" className="tabular">
                    {r.gross_weight}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {r.carat_weight}
                  </TableCell>
                  <TableCell>{r.created_at?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Print smart card"
                        icon={SmartIcon}
                        onClick={() => printCard(r.id, 'smart')}
                      />
                      <IconAction
                        label="Print classic card"
                        icon={ClassicIcon}
                        onClick={() => printCard(r.id, 'classic')}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>
    </>
  );
}
