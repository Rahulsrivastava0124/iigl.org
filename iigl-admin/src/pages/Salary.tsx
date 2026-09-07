import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import PayIcon from '@mui/icons-material/PaymentsOutlined';
import PayslipIcon from '@mui/icons-material/ReceiptLongOutlined';
import {
  Grid,
  Link,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { apiUrl } from '../lib/config';
import { useFetch } from '../lib/useFetch';
import { hours } from '../lib/attendance';
import SalaryPay from '../components/SalaryPay';
import { IconAction, Panel, RowActions, TableFrame, Tile, money } from '../components/ui';

/**
 * What each employee is owed for a month, what the month says they worked, and
 * what they have actually been paid.
 *
 * The pro-rata figure — the monthly salary over the days in the month, times
 * the days present — is not stated as a column any more: it is arithmetic
 * nobody has agreed, and a column of it read as an amount owed. It survives
 * where it belongs, as the figure the Pay dialog opens on. What the list states
 * is the record: the month's salary, the days, and what has been paid against
 * it. The payments themselves — each one's date, mode and reference — are one
 * person's history rather than a month's, so they are on their page, where an
 * old month's payslip is also reachable.
 */

interface SalaryRow {
  id: number;
  empid: string | null;
  fullname: string;
  lab_name: string | null;
  salary: number;
  joining_date: string | null;
  days_present: number;
  minutes_worked: number;
  payable: number;
  paid: number;
}

/** The last twelve months, newest first, as `YYYY-MM`. */
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});

const monthLabel = (value: string) => {
  const [y, m] = value.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

/** The payslip, as the other documents open: the API renders it, the tab shows it. */
const openPayslip = (empId: number, month: string) =>
  window.open(apiUrl(`/users/staff/${empId}/payslip?month=${month}`), '_blank');

export default function Salary() {
  const [month, setMonth] = useState(MONTHS[0]);
  const [paying, setPaying] = useState<SalaryRow | null>(null);

  const { data, loading, error, reload } = useFetch<{
    data: SalaryRow[];
    month: string;
    days_in_month: number;
  }>(`/users/staff/salary?month=${month}`);

  const rows = data?.data ?? [];
  const days = data?.days_in_month ?? 30;
  const agreed = rows.reduce((sum, r) => sum + r.salary, 0);
  const paid = rows.reduce((sum, r) => sum + r.paid, 0);

  return (
    <>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Tile label="Employees" value={String(rows.length)} fill="brand" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Tile label="Agreed monthly" value={money(agreed)} fill="brand" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Tile label="Paid this month" value={money(paid)} fill="settled" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Tile label="Days in month" value={String(days)} />
        </Grid>
      </Grid>

      <Panel
        title="Salary"
        subtitle={monthLabel(month)}
        count={loading ? 'Loading…' : `${rows.length} on the books`}
        actions={
          <TextField
            select
            label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            sx={{ width: 190 }}
          >
            {MONTHS.map((m) => (
              <MenuItem key={m} value={m}>
                {monthLabel(m)}
              </MenuItem>
            ))}
          </TextField>
        }
      >
        <TableFrame
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText="Nobody is on the books."
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Emp ID</TableCell>
                <TableCell align="right">Monthly salary</TableCell>
                <TableCell align="right">Days present</TableCell>
                <TableCell align="right">Hours worked</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                    {/* Their page, where the attendance these days come from is
                        the calendar. */}
                    <Link component={RouterLink} to={`/staff/${r.id}`} underline="hover">
                      {r.fullname}
                    </Link>
                  </TableCell>
                  <TableCell className="mono">{r.empid ?? '—'}</TableCell>
                  <TableCell align="right" className="tabular">
                    {r.salary > 0 ? money(r.salary) : '—'}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {r.days_present} / {days}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {hours(r.minutes_worked)}
                  </TableCell>
                  <TableCell align="right" className="tabular" sx={{ fontWeight: 600 }}>
                    {r.paid > 0 ? money(r.paid) : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <RowActions>
                      <IconAction label="Pay" icon={PayIcon} onClick={() => setPaying(r)} />
                      <IconAction
                        label="Payslip"
                        icon={PayslipIcon}
                        onClick={() => openPayslip(r.id, month)}
                        disabled={r.paid <= 0}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {paying && (
        <SalaryPay
          empId={paying.id}
          name={paying.fullname}
          month={month}
          monthLabel={monthLabel(month)}
          suggested={paying.payable}
          alreadyPaid={paying.paid}
          onClose={() => setPaying(null)}
          onPaid={reload}
        />
      )}
    </>
  );
}
