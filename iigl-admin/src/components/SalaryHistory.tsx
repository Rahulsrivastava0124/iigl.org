import { Fragment, useId, useState } from 'react';
import PayslipIcon from '@mui/icons-material/ReceiptLongOutlined';
import OpenIcon from '@mui/icons-material/KeyboardArrowDown';
import CloseIcon from '@mui/icons-material/KeyboardArrowUp';
import {
  Box,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { apiUrl } from '../lib/config';
import { useFetch } from '../lib/useFetch';
import { IconAction, Panel, RowActions, TableFrame, money } from '../components/ui';

/**
 * One person's salary payments, a month at a time.
 *
 * A month is the unit anybody asks about — "was September paid" — and a month
 * is usually several payments: a part payment on the 7th and the rest on the
 * 8th are one answer, not two. So the table lists months, each stating its
 * total and carrying the payslip that says the same thing on paper, and the
 * payments themselves open underneath the month they belong to.
 *
 * The newest month opens on arrival, since it is the one being asked about.
 *
 * To refresh it after a payment, change its `key`. There is nothing here worth
 * an imperative handle.
 */

interface Payment {
  id: number;
  emp_id: number;
  month: string;
  amount: string;
  paid_on: string | null;
  /** The agreed monthly salary as it stood when this was paid, not as it is now. */
  salary_month: string | null;
  pay_mode: string;
  reference: string | null;
  note: string | null;
  paid_by_name: string | null;
}

const monthLabel = (value: string) => {
  const [y, m] = String(value).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

const sum = (rows: Payment[]) => rows.reduce((t, r) => t + Number(r.amount || 0), 0);

/** One month: what it came to, and — opened — what it was made of. */
function Month({
  empId,
  month,
  paid,
  defaultOpen,
}: {
  empId: number;
  month: string;
  paid: Payment[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const detailsId = useId();
  const label = monthLabel(month);

  return (
    <Fragment>
      <TableRow
        hover
        sx={{ '& > .MuiTableCell-root': { borderBottom: open ? 'unset' : undefined } }}
      >
        <TableCell sx={{ width: 48 }}>
          <IconButton
            aria-label={open ? `Hide ${label}'s payments` : `Show ${label}'s payments`}
            aria-expanded={open}
            aria-controls={detailsId}
            size="small"
            onClick={() => setOpen(!open)}
          >
            {open ? <CloseIcon fontSize="small" /> : <OpenIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontWeight: 600 }}>{label}</TableCell>
        <TableCell className="tabular">
          {paid.length} {paid.length === 1 ? 'payment' : 'payments'}
        </TableCell>
        <TableCell align="right" className="tabular">
          {/* The salary the newest payment of the month was made against. */}
          {Number(paid[0]?.salary_month) > 0 ? money(paid[0].salary_month) : '—'}
        </TableCell>
        <TableCell align="right" className="tabular" sx={{ fontWeight: 700 }}>
          {money(sum(paid))}
        </TableCell>
        <TableCell align="right">
          <RowActions>
            <IconAction
              label={`Payslip for ${label}`}
              icon={PayslipIcon}
              onClick={() =>
                window.open(apiUrl(`/users/staff/${empId}/payslip?month=${month}`), '_blank')
              }
            />
          </RowActions>
        </TableCell>
      </TableRow>

      <TableRow id={detailsId} aria-hidden={!open ? true : undefined}>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ my: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Paid on</TableCell>
                    <TableCell>Mode</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Note</TableCell>
                    <TableCell>Paid by</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paid.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular">{r.paid_on?.slice(0, 10) ?? '—'}</TableCell>
                      <TableCell>{r.pay_mode}</TableCell>
                      <TableCell className="mono">{r.reference ?? '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'normal' }}>{r.note ?? '—'}</TableCell>
                      <TableCell>{r.paid_by_name ?? '—'}</TableCell>
                      <TableCell align="right" className="tabular" sx={{ fontWeight: 600 }}>
                        {money(r.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

export default function SalaryHistory({
  empId,
  title = 'Salary paid',
  sx,
}: {
  empId: number;
  title?: string;
  sx?: object;
}) {
  const { data, loading, error } = useFetch<{ data: Payment[] }>(
    `/users/staff/salary/payments?emp_id=${empId}&per_page=100`,
  );

  const rows = data?.data ?? [];

  /*
    Months in the order the API sent them — newest first — with each month's
    payments under it. A Map keeps that order; grouping into a plain object and
    reading the keys back does not, for keys that look like numbers.
  */
  const months = new Map<string, Payment[]>();
  for (const r of rows) {
    const held = months.get(r.month);
    if (held) held.push(r);
    else months.set(r.month, [r]);
  }

  return (
    <Panel
      title={title}
      count={
        loading
          ? 'Loading…'
          : `${months.size} ${months.size === 1 ? 'month' : 'months'} · ${money(sum(rows))} paid`
      }
      sx={sx}
    >
      <TableFrame
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText="Nothing has been paid yet."
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Month</TableCell>
              <TableCell>Payments</TableCell>
              <TableCell align="right">Monthly salary</TableCell>
              <TableCell align="right">Total paid</TableCell>
              <TableCell align="right">Payslip</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...months].map(([month, paid], i) => (
              <Month key={month} empId={empId} month={month} paid={paid} defaultOpen={i === 0} />
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </Panel>
  );
}
