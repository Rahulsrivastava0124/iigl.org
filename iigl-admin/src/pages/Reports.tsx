import { useState } from 'react';
import {
  Avatar,
  Button,
  Checkbox,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import { useFetch, useDebounced, useUrlSearch } from '../lib/useFetch';
import { IconAction, DEFAULT_PER_PAGE, OrderRef, Pager, Panel, RowActions, SearchField, TableFrame } from '../components/ui';
import { useAuth } from '../lib/auth';
import { isLab, isSuper } from '../lib/portal';
import DateRangeField from '../components/DateRangeField';
import type { Paged, Report } from '../lib/api';
import { apiUrl, fileUrl, printCard } from '../lib/config';
import FilePreview from '../components/FilePreview';
import SmartIcon from '@mui/icons-material/CreditCardOutlined';
import ClassicIcon from '@mui/icons-material/DescriptionOutlined';
import HeaderCardIcon from '@mui/icons-material/BrandingWatermarkOutlined';

/** A weight only when there is one: a zero gross or carat reads as "not
 *  recorded", which a dash says and "0.00" does not. */
const weight = (v?: string | null) => (v && Number(v) > 0 ? v : '—');

export default function Reports() {
  // Staff see only their own certificates, so a "Created by" column that always
  // reads their own name is noise; head office and a laboratory keep it.
  const { user } = useAuth();
  const staff = !isSuper(user) && !isLab(user);

  const [page, setPage] = useState(1);
  /** Rows per page. Component state, not a URL parameter: it is how somebody
   * likes to read a list, not which list they are looking at. */
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [selected, setSelected] = useState<number[]>([]);
  /** The stone being looked at full size, or none. */
  const [preview, setPreview] = useState<{ path: string; name: string } | null>(null);

  // Server-side: 22,000 certificates, 25 on screen.
  // Seeded from `?q=` so the header search, which navigates here with the
  // certificate number, actually filters the list it lands on.
  const [search, setSearch] = useUrlSearch();
  const term = useDebounced(search);

  // A date range over when the certificate was issued, picked on one calendar
  // the way the wallet's statement is.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Who wrote it, and which card the order asked for.
  const [createdBy, setCreatedBy] = useState('');
  const [card, setCard] = useState('');

  const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (term.trim()) query.set('q', term.trim());
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (createdBy) query.set('created_by', createdBy);
  if (card) query.set('card', card);

  const { data, loading, error } = useFetch<Paged<Report>>(`/reports?${query}`);
  const rows = data?.data ?? [];

  // The people who have written certificates in view, for the Created-by filter.
  const creators = useFetch<{ data: { id: number; fullname: string }[] }>('/reports/creators');

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
            {/* Issued between these dates, on one calendar — the wallet's field. */}
            <DateRangeField
              label="Issued between"
              size="small"
              from={from}
              to={to}
              onChange={(f, t) => {
                setFrom(f);
                setTo(t);
                setPage(1);
              }}
              width={250}
            />
            {!staff && (
              <TextField
                select
                size="small"
                label="Created by"
                value={createdBy}
                onChange={(e) => {
                  setCreatedBy(e.target.value);
                  setPage(1);
                }}
                sx={{ width: 180 }}
              >
                <MenuItem value="">
                  <em>Everyone</em>
                </MenuItem>
                {(creators.data?.data ?? []).map((u) => (
                  <MenuItem key={u.id} value={String(u.id)}>
                    {u.fullname}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              select
              size="small"
              label="Card"
              value={card}
              onChange={(e) => {
                setCard(e.target.value);
                setPage(1);
              }}
              sx={{ width: 130 }}
            >
              <MenuItem value="">
                <em>All cards</em>
              </MenuItem>
              <MenuItem value="smart">Smart</MenuItem>
              <MenuItem value="classic">Classic</MenuItem>
            </TextField>
            {/* Only the one thing worth saying: that the selection is past the
                print cap. The plain count read as clutter, "0 selected" most of
                all. */}
            {selected.length > 50 && (
              <Typography variant="body2" color="error">
                {selected.length} selected — the cap is 50 per print run
              </Typography>
            )}
            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              disabled={selected.length === 0 || selected.length > 50}
              onClick={printBatch}
            >
              Print
            </Button>
          </>
        }
      >
        {/* Named, for the same reason the order list names it: an empty
            filtered list and an empty list are different facts, and the header
            search lands here with a certificate number in the box. */}
        <TableFrame
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText={
            term.trim()
              ? `No certificate here matches “${term.trim()}”. A certificate belongs to the laboratory that issued it.`
              : 'No certificates yet.'
          }
        >
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
                <TableCell>Date</TableCell>
                <TableCell>Certificate</TableCell>
                <TableCell sx={{ width: 72 }}>Image</TableCell>
                <TableCell>Item Name</TableCell>
                <TableCell align="right">Gross Wt</TableCell>
                <TableCell align="right">Carat Wt</TableCell>
                <TableCell>Comment</TableCell>
                {!staff && <TableCell>Created by</TableCell>}
                <TableCell>Order No</TableCell>
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
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.created_at?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell className="mono">{r.report_no}</TableCell>
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
                        width: 60,
                        height: 60,
                        bgcolor: 'action.hover',
                        color: 'text.secondary',
                        fontSize: 12,
                        cursor: r.item_image ? 'zoom-in' : 'default',
                      }}
                    >
                      —
                    </Avatar>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.item_name ?? '—'}</TableCell>
                  <TableCell align="right" className="tabular">
                    {weight(r.gross_weight)}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {weight(r.carat_weight)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 200, whiteSpace: 'normal' }}>{r.comments || '—'}</TableCell>
                  {!staff && <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.created_by ?? '—'}</TableCell>}
                  <TableCell className="mono">
                    {r.order_id ? (
                      <OrderRef id={r.order_id}>{r.order_number ?? `#${r.order_no}`}</OrderRef>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  {/* The cards the order asked for, and only those. Every row
                      used to offer both, so half the buttons on this screen
                      printed a card nobody had ordered. */}
                  <TableCell align="right">
                    <RowActions>
                      {r.smart_card && (
                        <>
                          <IconAction
                            label="Print smart card"
                            icon={SmartIcon}
                            onClick={() => printCard(r.id, 'smart')}
                          />
                          {/* The same card carrying the customer's own name and
                              mark. Offered always rather than only when the
                              order asked for them, because which of the two to
                              hand over is the counter's choice. */}
                          <IconAction
                            label="Print smart card with header"
                            icon={HeaderCardIcon}
                            onClick={() => printCard(r.id, 'smart-header')}
                          />
                        </>
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
