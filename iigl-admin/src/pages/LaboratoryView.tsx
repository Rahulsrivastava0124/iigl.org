import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBackOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import CommissionIcon from '@mui/icons-material/PercentOutlined';
import PaidIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import DuesIcon from '@mui/icons-material/PendingActionsOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api, type PageMeta } from '../lib/api';
import { fileUrl } from '../lib/config';
import { messageOf, useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import { useToast } from '../components/Toast';
import FilePreview from '../components/FilePreview';
import DateRangeField from '../components/DateRangeField';
import { StatementsTable } from '../components/Statements';
import {
  Notice,
  Panel,
  SearchField,
  StateChip,
  StatusChip,
  TableFrame,
  Tile,
  money,
  TILE_CELL,
  Pager,
} from '../components/ui';

/**
 * One laboratory: what it has earned, and what it has been doing.
 *
 * A page rather than a dialog. Three tables and a set of figures is a screen,
 * and a screen wants an address: this one can be linked to, bookmarked,
 * reloaded and opened in a second tab beside another laboratory, none of which
 * a modal can do.
 *
 * Everything comes from one request. The API returns payments, staff and
 * reports together — the page shows all three tabs — and the money with them,
 * so arriving by a typed address works exactly as arriving from the list does.
 *
 * Each list is the 50 most recent, with the real total on the tab. This is a
 * summary: the full history lives on Account, Employee Management and
 * Certificates, which page and filter properly.
 */

interface Payment {
  id: number;
  amount: string;
  status: number;
  pay_mode: string | null;
  transaction_no: string | null;
  created_at: string | null;
}

interface Staff {
  id: number;
  fullname: string;
  mobile: string | null;
  empid: string | null;
  is_active: number;
  joining_date: string | null;
}

interface Report {
  id: number;
  report_no: string;
  carat_weight: string | null;
  gross_weight: string | null;
  created_at: string | null;
  /** The stone as it is printed on the card. */
  item_image: string | null;
  /** 1 when the public verification endpoint will not answer for this number. */
  hidden_on_site: number;
}

interface Detail {
  laboratory: {
    id: number;
    fullname: string;
    owner_name: string | null;
    empid: string | null;
    mobile: string;
    city: string | null;
    commision: number | null;
    commission_type: string | null;
    is_active: number;
    commission_accrued: number;
    commission_paid: number;
    commission_due: number;
  };
  payments: Payment[];
  staff: Staff[];
  reports: Report[];
  counts: { payments: number; staff: number; reports: number };
  shown: number;
  report_meta: PageMeta;
}

const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '—');
/** A weight only when there is one: a zero reads as "not recorded". */
const weight = (v: string | null | undefined) => (v && Number(v) > 0 ? v : '—');

export default function LaboratoryView() {
  // Head office's staff may open this page (Laboratories → View) but not change
  // the laboratory or which of its certificates are published.
  const superAdmin = isSuper(useAuth().user);
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'payments' | 'staff' | 'reports' | 'statements'>('payments');

  /*
    The certificate search, on the server.

    This tab shows the fifty most recent of however many the laboratory has
    issued, so a box that filtered what had already arrived would search fifty
    of 1,811 and answer "nothing matches" about the other 1,761. The term goes
    to the endpoint, which filters and counts under the same condition.

    Debounced, because each keystroke is otherwise a `LIKE '%…%'` over a
    laboratory's whole certificate history.
  */
  const [certSearch, setCertSearch] = useState('');
  const certTerm = useDebounced(certSearch).trim();
  // The Certificates tab pages through the whole history now.
  const [certPage, setCertPage] = useState(1);
  const [certPerPage, setCertPerPage] = useState(50);
  // Certificates issued between these dates, picked on one calendar.
  const [certFrom, setCertFrom] = useState('');
  const [certTo, setCertTo] = useState('');

  const detailQuery = new URLSearchParams({ page: String(certPage), per_page: String(certPerPage) });
  if (certTerm) detailQuery.set('q', certTerm);
  if (certFrom) detailQuery.set('from', certFrom);
  if (certTo) detailQuery.set('to', certTo);
  const source = useFetch<{ data: Detail }>(`/users/laboratories/${id}/detail?${detailQuery}`);
  const d = source.data?.data;
  const lab = d?.laboratory;

  const toast = useToast();
  const reports = d?.reports ?? [];
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ path: string; name: string } | null>(null);

  /**
   * Publish or withhold certificates, written the moment the box is ticked.
   *
   * The box **is** the setting rather than a selection to act on later: there
   * was a Save alongside it, and a tickbox next to a button is a question about
   * whether the tick has happened yet. Ticked means the public site will not
   * answer for that number.
   *
   * Reloaded rather than patched in place, so what is on screen is what the
   * database says — a tick that appears to have taken and did not is the one
   * failure this must not have.
   */
  const setHidden = async (ids: number[], hidden: boolean) => {
    setSaving(true);
    try {
      await api.patch('/reports/visibility', { report_ids: ids, hidden });
      await source.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setSaving(false);
    }
  };

  /** "All" is the rows on screen: this tab is a capped preview of the history. */
  const allHidden = reports.length > 0 && reports.every((r) => r.hidden_on_site);

  if (source.error) return <Notice kind="error">{source.error}</Notice>;

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Button color="inherit" startIcon={<BackIcon />} onClick={() => navigate('/laboratories')}>
            Laboratories
          </Button>
          <Typography variant="h2" sx={{ m: 0 }} noWrap>
            {lab?.fullname ?? '…'}
          </Typography>
          {lab && (
            <StateChip
              tone={lab.is_active ? 'settled' : 'refused'}
              label={lab.is_active ? 'Active' : 'Inactive'}
            />
          )}
        </Stack>
        {lab && superAdmin && (
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => navigate(`/laboratories/${lab.id}/edit`)}
          >
            Edit
          </Button>
        )}
      </Stack>

      {/*
        There was an identifier line here — code, owner, mobile, city, rate.
        None of it is why this page is opened: it is opened for the money and
        the certificates below, and every one of those five is on the record
        itself, behind Edit.
      */}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={TILE_CELL}>
            <Tile
              label="Commission"
              value={money(lab?.commission_accrued ?? 0)}
              note="on collections"
              fill="brand"
              icon={CommissionIcon}
            />
        </Grid>
        <Grid size={TILE_CELL}>
            <Tile
              label="Paid"
              value={money(lab?.commission_paid ?? 0)}
              fill="settled"
              icon={PaidIcon}
            />
        </Grid>
        <Grid size={TILE_CELL}>
            <Tile
              label="Due"
              value={money(lab?.commission_due ?? 0)}
              fill={(lab?.commission_due ?? 0) > 0 ? 'waiting' : 'settled'}
              icon={DuesIcon}
            />
        </Grid>
      </Grid>

      <Panel>
        {/*
          The tabs, and the one control that belongs beside them.

          On the row rather than above the table: it filters what the tab is
          showing, and the tabs line is the only full-width row this panel has.
          `alignItems: flex-end` sits the field on the tabs' own baseline
          instead of centring it against their taller box.
        */}
        <Box
          sx={{
            mb: 1,
            pr: 1,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab value="payments" label={`Payments (${d?.counts.payments ?? 0})`} />
            <Tab value="staff" label={`Staff (${d?.counts.staff ?? 0})`} />
            <Tab value="reports" label={`Certificates (${d?.counts.reports ?? 0})`} />
            <Tab value="statements" label="Statements" />
          </Tabs>

          {/* Only on the tab it filters. A search box over the payments list
              that searches certificates is a control that lies about itself. */}
          {tab === 'reports' && (
            <Stack direction="row" spacing={1.5} sx={{ py: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <SearchField
                placeholder="Certificate number…"
                value={certSearch}
                onChange={(v) => {
                  setCertSearch(v);
                  setCertPage(1);
                }}
                width={220}
              />
              <DateRangeField
                label="Issued between"
                size="small"
                from={certFrom}
                to={certTo}
                onChange={(f, t) => {
                  setCertFrom(f);
                  setCertTo(t);
                  setCertPage(1);
                }}
                width={250}
              />
            </Stack>
          )}
        </Box>

        {tab === 'payments' && (
          <TableFrame
            loading={source.loading}
            error={source.error}
            empty={(d?.payments.length ?? 0) === 0}
            emptyText="This laboratory has sent no payments yet."
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(d?.payments ?? []).map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(p.created_at)}</TableCell>
                    <TableCell className="mono">{p.transaction_no ?? '—'}</TableCell>
                    <TableCell>{p.pay_mode ?? '—'}</TableCell>
                    <TableCell align="right" className="tabular">
                      {money(p.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={p.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}

        {tab === 'staff' && (
          <TableFrame
            loading={source.loading}
            error={source.error}
            empty={(d?.staff.length ?? 0) === 0}
            emptyText="Nobody is working under this laboratory."
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Emp ID</TableCell>
                  <TableCell>Mobile</TableCell>
                  <TableCell>Joined</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(d?.staff ?? []).map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>{s.fullname}</TableCell>
                    <TableCell className="mono">{s.empid ?? '—'}</TableCell>
                    <TableCell className="mono">{s.mobile ?? '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(s.joining_date)}</TableCell>
                    <TableCell>
                      <StateChip
                        tone={s.is_active ? 'settled' : 'refused'}
                        label={s.is_active ? 'Active' : 'Inactive'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}

        {tab === 'reports' && (
          <>
            <TableFrame
              loading={source.loading}
              error={source.error}
              empty={reports.length === 0}
              emptyText={
              certTerm
                ? `No certificate of this laboratory matches “${certTerm}”.`
                : 'This laboratory has issued no certificates.'
            }
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 56 }}>Item</TableCell>
                    <TableCell>Certificate</TableCell>
                    <TableCell align="right">Carat</TableCell>
                    <TableCell align="right">Gross</TableCell>
                    <TableCell>Issued</TableCell>
                    {/*
                      Last, and named. A tickbox in the first column is read as
                      "pick this row"; this one is the setting itself, and the
                      only thing that says so is the word above it.
                    */}
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {/* Label then box, right-aligned, so the header box sits
                          over the row boxes below it at the column's edge. */}
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                        <span>Hidden</span>
                        <Checkbox
                          size="small"
                          // No padding, like the row boxes under it, so the two
                          // line up; white, because the default grey does not
                          // show on the navy header.
                          sx={{
                            p: 0,
                            color: 'common.white',
                            '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: 'common.white' },
                            '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.45)' },
                          }}
                          checked={allHidden}
                          indeterminate={!allHidden && reports.some((r) => !!r.hidden_on_site)}
                          disabled={!superAdmin || saving || reports.length === 0}
                          onChange={() => setHidden(reports.map((r) => r.id), !allHidden)}
                          slotProps={{
                            input: { 'aria-label': 'Hide every certificate shown from the public site' },
                          }}
                        />
                      </Stack>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reports.map((r) => (
                    <TableRow key={r.id} hover selected={!!r.hidden_on_site}>
                      <TableCell>
                        {/*
                          Avatar rather than a bare <img>: it draws its fallback
                          when the file is missing, and the older certificates
                          were written by the Laravel application, so some of
                          those files are gone.
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
                      <TableCell align="right" className="tabular">
                        {weight(r.carat_weight)}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {weight(r.gross_weight)}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(r.created_at)}</TableCell>
                      <TableCell align="right" sx={{ pr: 2 }}>
                        <Checkbox
                          size="small"
                          sx={{ p: 0 }}
                          checked={!!r.hidden_on_site}
                          disabled={!superAdmin || saving}
                          onChange={() => setHidden([r.id], !r.hidden_on_site)}
                          slotProps={{
                            input: { 'aria-label': `Hide ${r.report_no} from the public site` },
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>

            {/*
              The list is capped, and says so.

              Fifty rows under a tab labelled 1,811 invites the reading that
              1,761 certificates have gone missing. The cap is deliberate — the
              full history has a screen of its own — but it has to be stated,
              and the more so now that a search runs against all of them while
              only the newest fifty matches come back.
            */}
            {/* The whole history, a page at a time — on its own rule the way the
                Certificates screen's footer is, the count at the far end. */}
            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1.25,
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              <Pager
                meta={d?.report_meta}
                onPage={setCertPage}
                onPerPage={(n) => {
                  setCertPerPage(n);
                  setCertPage(1);
                }}
              />
              <Typography variant="body2" color="text.secondary" className="tabular">
                {(d?.counts.reports ?? 0).toLocaleString()} certificate
                {(d?.counts.reports ?? 0) === 1 ? '' : 's'}
                {certTerm ? ' matching' : ''}
              </Typography>
            </Stack>
          </>
        )}

        {tab === 'statements' && id && <StatementsTable labId={Number(id)} />}

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
