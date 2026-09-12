import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import { useFetch } from '../lib/useFetch';
import { apiUrl } from '../lib/config';
import { useAuth } from '../lib/auth';
import { isLab, isSuper } from '../lib/portal';
import { IconAction, Notice, StateChip, TableFrame, money, type Tone } from './ui';

/** One billed statement, as `GET /statements` returns it. */
export interface StatementPeriod {
  key: string;
  from: string;
  to: string;
  billed_on: string;
  due_on: string;
  orders: number;
  commission: number;
  paid: number;
  balance: number;
  state: 'paid' | 'due' | 'overdue';
}

export interface LabStatements {
  lab: { id: number; fullname: string };
  period_months: number;
  grace_days: number;
  starts_on: string;
  today: string;
  periods: StatementPeriod[];
  current: { key: string; from: string; to: string; billed_on: string; orders: number; commission: number } | null;
  billed: number;
  paid: number;
  pending: number;
  outstanding: number;
  standing: 'clear' | 'grace' | 'locked';
  reminder: null | { key: string; amount: number; billed_on: string; due_on: string; days_left: number; overdue_days: number };
}

const STATE: Record<StatementPeriod['state'], { tone: Tone; label: string }> = {
  paid: { tone: 'settled', label: 'Paid' },
  due: { tone: 'lead', label: 'Due' },
  overdue: { tone: 'refused', label: 'Overdue' },
};

const month = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

/** `Sep 2026`, or `Jul 2026 – Sep 2026` for a longer period. */
export const periodLabel = (p: { from: string; to: string }) =>
  p.from.slice(0, 7) === p.to.slice(0, 7) ? month(p.from) : `${month(p.from)} – ${month(p.to)}`;

/** Opens one billed statement as a PDF in a new tab. */
export const downloadStatement = (key: string, labId?: number) =>
  window.open(
    apiUrl(`/statements/${key}/download${labId ? `?lab_id=${labId}` : ''}`),
    '_blank',
    'noopener',
  );

/**
 * A laboratory's statements: the terms, the period running now, and every
 * billed one with its download. Head office passes `labId`; a laboratory reads
 * its own. Plain content — the caller supplies the panel around it.
 */
export function StatementsTable({ labId }: { labId?: number }) {
  const source = useFetch<{ data: LabStatements }>(`/statements${labId ? `?lab_id=${labId}` : ''}`);
  const s = source.data?.data;
  const rows = s?.periods ?? [];

  return (
    <>
      {/*
        What is owed, and the date that belongs to it. Nothing else.

        The terms — period length, grace days, the month billing started — are the
        laboratory's settings and are read on its own screen; restating them
        above every statements table pushed the one figure anybody opens this
        for to the end of a sentence. Billed and Paid totals are in the table,
        column by column and period by period, which is where a number somebody
        wants to check belongs.

        Two different dates, because "Outstanding 0" and "Outstanding 4,200"
        are asking different questions. With something owed, the date wanted is
        when that was billed — `reminder` is the oldest statement not paid in
        full, so its billed_on is the one. With nothing owed, the only date
        worth printing is when the running period bills next, and calling a
        future date "Billed on" would read as though it already had.
      */}
      {s && (
        <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="body2">
            <b>Outstanding {money(s.outstanding)}</b>
            {s.reminder
              ? ` · Billed on ${s.reminder.billed_on}`
              : s.current
                ? ` · Next billed on ${s.current.billed_on}`
                : ''}
          </Typography>
        </Box>
      )}
      <TableFrame
        loading={source.loading}
        error={source.error}
        empty={rows.length === 0}
        emptyText="No statement has been billed yet. The first is billed the day after its period ends."
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Period</TableCell>
              <TableCell>Billed on</TableCell>
              <TableCell>Due on</TableCell>
              <TableCell align="right">Commission</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.key} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{periodLabel(p)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.billed_on}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.due_on}</TableCell>
                <TableCell align="right" className="tabular">{money(p.commission)}</TableCell>
                <TableCell align="right" className="tabular">{money(p.paid)}</TableCell>
                <TableCell align="right" className="tabular" sx={{ fontWeight: 600 }}>{money(p.balance)}</TableCell>
                <TableCell>
                  <StateChip {...STATE[p.state]} />
                </TableCell>
                <TableCell>
                  <IconAction
                    label="Download statement"
                    icon={DownloadIcon}
                    onClick={() => downloadStatement(p.key, labId)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
}

/**
 * Above every page for a laboratory and its staff: the reminder through the
 * grace days, and the lock after them.
 *
 * The reminder is shown every day until the statement is paid. "Remind me
 * tomorrow" hides it for the rest of today only. The lock is not dismissible —
 * certificate generation is refused until head office approves a payment.
 */
export function StatementReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const lab = isLab(user);
  const source = useFetch<{ data: Partial<LabStatements> & { standing: LabStatements['standing'] } }>(
    user && !isSuper(user) ? '/statements' : null,
  );
  const s = source.data?.data;
  const r = s?.reminder ?? null;

  const hideKey = r ? `statement-reminder:${r.due_on}:${s?.today}` : '';
  const [hidden, setHidden] = useState(() => {
    try {
      return Boolean(hideKey) && localStorage.getItem(hideKey) === '1';
    } catch {
      return false;
    }
  });
  const hiddenToday =
    hidden ||
    (() => {
      try {
        return Boolean(hideKey) && localStorage.getItem(hideKey) === '1';
      } catch {
        return false;
      }
    })();

  if (!s || s.standing === 'clear') return null;
  const locked = s.standing === 'locked';

  // Staff are told only that generation is locked, and by whom it is lifted.
  if (!lab) {
    return locked ? (
      <Notice kind="error">
        Certificate generation is locked: your laboratory has an overdue commission statement. It unlocks once
        the laboratory pays and head office approves the payment.
      </Notice>
    ) : null;
  }
  if (!r || (!locked && hiddenToday)) return null;

  const amount = money(r.amount);
  const text = locked
    ? `Certificate generation is locked. Your statement billed on ${r.billed_on} was due on ${r.due_on} — ${r.overdue_days} ${r.overdue_days === 1 ? 'day' : 'days'} overdue, ${amount} outstanding. ` +
      ((s.pending ?? 0) > 0
        ? `Your payment of ${money(s.pending ?? 0)} is waiting on head office; this unlocks once it is approved.`
        : 'Pay it to unlock — generation resumes once head office approves the payment.')
    : `Your commission statement was billed on ${r.billed_on}: ${amount} to pay by ${r.due_on} — ${
        r.days_left === 0 ? 'today is the last day' : `${r.days_left} ${r.days_left === 1 ? 'day' : 'days'} left`
      }. Unpaid after that, certificate generation is locked.`;

  return (
    <Notice kind={locked ? 'error' : 'warn'} sx={{ '& .MuiAlert-message': { flex: 1 } }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>{text}</Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {!locked && (
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                try {
                  localStorage.setItem(hideKey, '1');
                } catch {
                  /* a browser that stores nothing just shows it again */
                }
                setHidden(true);
              }}
            >
              Remind me tomorrow
            </Button>
          )}
          <Button size="small" variant="outlined" color="inherit" onClick={() => downloadStatement(r.key)}>
            Download statement
          </Button>
          {(s.pending ?? 0) === 0 && (
            <Button
              size="small"
              variant="contained"
              onClick={() => navigate(`/transactions?type=commision&pay=${r.amount}`)}
            >
              Pay {amount}
            </Button>
          )}
        </Stack>
      </Stack>
    </Notice>
  );
}
