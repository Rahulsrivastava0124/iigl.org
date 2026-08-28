import { useState } from 'react';
import {
  Button,
  Checkbox,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import { useFetch } from '../lib/useFetch';
import { PageHead, Pager, Panel, TableFrame } from '../components/ui';
import type { Paged, Report } from '../lib/api';
import { apiUrl } from '../lib/config';

/** Opens a card PDF in a new tab. The API streams it inline. */
function printCard(id: number, kind: 'smart' | 'classic') {
  window.open(apiUrl(`/cards/${kind}/${id}`), '_blank', 'noopener');
}

export default function Reports() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);

  const { data, loading, error } = useFetch<Paged<Report>>(`/reports?page=${page}&per_page=25`);
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
      <PageHead
        title="Certificates"
        subtitle={data ? `${data.meta.total.toLocaleString()} issued` : 'Loading…'}
      />

      <Panel
        actions={
          <>
            <Typography variant="body2" color={selected.length > 50 ? 'error' : 'text.secondary'}>
              {selected.length} selected
              {selected.length > 50 && ' — the cap is 50 per print run'}
            </Typography>
            <Button
              variant="contained"
              size="small"
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
                    <Stack direction="row" spacing={0.5}>
                      <Button size="small" onClick={() => printCard(r.id, 'smart')}>
                        Smart
                      </Button>
                      <Button size="small" onClick={() => printCard(r.id, 'classic')}>
                        Classic
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>
    </>
  );
}
