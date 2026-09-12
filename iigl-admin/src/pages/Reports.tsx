import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Avatar,
  Button,
  Checkbox,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import { useFetch, useDebounced } from '../lib/useFetch';
import { IconAction, DEFAULT_PER_PAGE, Pager, Panel, RowActions, SearchField, TableFrame } from '../components/ui';
import type { Paged, Report } from '../lib/api';
import { apiUrl, fileUrl } from '../lib/config';
import FilePreview from '../components/FilePreview';
import SmartIcon from '@mui/icons-material/CreditCardOutlined';
import ClassicIcon from '@mui/icons-material/DescriptionOutlined';

/** Opens a card PDF in a new tab. The API streams it inline. */
function printCard(id: number, kind: 'smart' | 'classic') {
  window.open(apiUrl(`/cards/${kind}/${id}`), '_blank', 'noopener');
}

export default function Reports() {
  const [page, setPage] = useState(1);
  /** Rows per page. Component state, not a URL parameter: it is how somebody
   * likes to read a list, not which list they are looking at. */
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [selected, setSelected] = useState<number[]>([]);
  /** The stone being looked at full size, or none. */
  const [preview, setPreview] = useState<{ path: string; name: string } | null>(null);

  // Server-side: 22,000 certificates, 25 on screen.
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
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
        footer={
          <Pager
            meta={data?.meta}
            onPage={setPage}
            onPerPage={(n) => {
              setPerPage(n);
              setPage(1);
              // A selection is page-local: 50 ticked rows on the page that is
              // about to be replaced are 50 ids nobody can see to untick.
              setSelected([]);
            }}
          />
        }
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
                {/*
                  The stone, as it is printed on the card.

                  The photograph was written with the certificate and rendered
                  on the card, and appeared nowhere anybody could look at it —
                  so the one way to check the right picture went onto the right
                  certificate was to print it.
                */}
                <TableCell sx={{ width: 56 }}>Item</TableCell>
                <TableCell>Certificate</TableCell>
                <TableCell>Order</TableCell>
                <TableCell align="right">Gross</TableCell>
                <TableCell align="right">Carat</TableCell>
                <TableCell>Issued</TableCell>
                <TableCell align="right">Print</TableCell>
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
                  <TableCell>
                    {/*
                      Avatar rather than a bare <img>: it draws its fallback
                      when the file is missing, and the older certificates were
                      written by the Laravel application, so some of those files
                      are gone.
                    */}
                    <Avatar
                      variant="rounded"
                      src={fileUrl(r.item_image) ?? undefined}
                      alt=""
                      onClick={
                        r.item_image
                          ? () => setPreview({ path: r.item_image!, name: r.report_no })
                          : undefined
                      }
                      // The whole stone, not a square crop of it.
                      slotProps={{ img: { sx: { objectFit: 'contain' } } }}
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: 'action.hover',
                        color: 'text.secondary',
                        fontSize: 12,
                        cursor: r.item_image ? 'zoom-in' : 'default',
                      }}
                    >
                      —
                    </Avatar>
                  </TableCell>
                  <TableCell className="mono">{r.report_no}</TableCell>
                  {/* The order by the number it is called everywhere else.
                      `order_no` on a certificate holds the order id, so this
                      column used to read "#9616" for an order the rest of the
                      panel calls 202608-484662. */}
                  <TableCell className="mono">
                    {r.order_id ? (
                      <Link component={RouterLink} to={`/orders/${r.order_id}`} underline="hover">
                        {r.order_number ?? `#${r.order_no}`}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {r.gross_weight}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {r.carat_weight}
                  </TableCell>
                  <TableCell>{r.created_at?.slice(0, 10) ?? '—'}</TableCell>
                  {/* The cards the order asked for, and only those. Every row
                      used to offer both, so half the buttons on this screen
                      printed a card nobody had ordered. */}
                  <TableCell align="right">
                    <RowActions>
                      {r.smart_card && (
                        <IconAction
                          label="Print smart card"
                          icon={SmartIcon}
                          onClick={() => printCard(r.id, 'smart')}
                        />
                      )}
                      {r.classic_card && (
                        <IconAction
                          label="Print classic card"
                          icon={ClassicIcon}
                          onClick={() => printCard(r.id, 'classic')}
                        />
                      )}
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {preview && (
        <FilePreview
          stored={preview.path}
          title={preview.name}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
