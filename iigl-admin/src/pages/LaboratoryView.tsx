import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
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
import { useFetch } from '../lib/useFetch';
import {
  Notice,
  Panel,
  StateChip,
  StatusChip,
  TableFrame,
  Tile,
  commissionRate,
  money,
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
}

const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '—');

export default function LaboratoryView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'payments' | 'staff' | 'reports'>('payments');

  const source = useFetch<{ data: Detail }>(`/users/laboratories/${id}/detail`);
  const d = source.data?.data;
  const lab = d?.laboratory;

  /** A list is capped; say so rather than letting a count and a table disagree. */
  const capped = (total: number, listed: number) =>
    total > listed ? `${listed} of ${total.toLocaleString()} shown` : `${total.toLocaleString()}`;

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
        {lab && (
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => navigate(`/laboratories/${lab.id}/edit`)}
          >
            Edit
          </Button>
        )}
      </Stack>

      {lab && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          {lab.empid ?? '—'} · {lab.owner_name ?? 'No owner recorded'} · {lab.mobile}
          {lab.city ? ` · ${lab.city}` : ''}
          {lab.commision == null ? '' : ` · ${commissionRate(lab.commision, lab.commission_type)} commission`}
        </Typography>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
            <Tile
              label="Commission"
              value={money(lab?.commission_accrued ?? 0)}
              note="on delivered orders"
              fill="brand"
              icon={CommissionIcon}
            />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
            <Tile
              label="Paid"
              value={money(lab?.commission_paid ?? 0)}
              fill="settled"
              icon={PaidIcon}
            />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
            <Tile
              label="Due"
              value={money(lab?.commission_due ?? 0)}
              fill={(lab?.commission_due ?? 0) > 0 ? 'waiting' : 'settled'}
              icon={DuesIcon}
            />
        </Grid>
      </Grid>

      <Panel>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="payments" label={`Payments (${d?.counts.payments ?? 0})`} />
          <Tab value="staff" label={`Staff (${d?.counts.staff ?? 0})`} />
          <Tab value="reports" label={`Certificates (${d?.counts.reports ?? 0})`} />
        </Tabs>

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
          <TableFrame
            loading={source.loading}
            error={source.error}
            empty={(d?.reports.length ?? 0) === 0}
            emptyText="This laboratory has issued no certificates."
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Certificate</TableCell>
                  <TableCell align="right">Carat</TableCell>
                  <TableCell align="right">Gross</TableCell>
                  <TableCell>Issued</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(d?.reports ?? []).map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell className="mono">{r.report_no}</TableCell>
                    <TableCell align="right" className="tabular">
                      {r.carat_weight || '—'}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {r.gross_weight || '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(r.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}

        {/*
          How much of each list is on screen, and where the rest is. One line,
          reading whichever tab is open.
        */}
        {d && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {tab === 'payments' && `Payments: ${capped(d.counts.payments, d.payments.length)}.`}
            {tab === 'staff' && `Staff: ${capped(d.counts.staff, d.staff.length)}.`}
            {tab === 'reports' && `Certificates: ${capped(d.counts.reports, d.reports.length)}.`}
            {' The full history is on the screen that owns it.'}
          </Typography>
        )}
      </Panel>
    </>
  );
}
