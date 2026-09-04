import { Grid, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import BalanceIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ReceivedIcon from '@mui/icons-material/SouthWestOutlined';
import SentIcon from '@mui/icons-material/NorthEastOutlined';
import AwaitingIcon from '@mui/icons-material/HourglassEmptyOutlined';
import { Panel, StatusChip, TableFrame, Tile, money } from './ui';

/**
 * The running account: what came in, what went out, and the balance after each.
 *
 * One component because two screens show it — the Wallet, which is the account
 * itself, and the Ledger tab of Transactions, which is the same account reached
 * from the money that made it. Two renderings of one statement is two chances
 * for a column to say something different about the same rupee.
 */

/** One line of the running account, as `/transactions/ledger` returns it. */
export interface LedgerEntry {
  id: number;
  date: string | null;
  type: string | null;
  direction: 'credit' | 'debit';
  amount: number;
  status: number;
  order_id: number | null;
  transaction_no: string | null;
  remark: string | null;
  balance: number;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  credit_total: number;
  debit_total: number;
  balance: number;
  pending_out: number;
  pending_in: number;
  total: number;
}

/** Four to a row on a wide screen, two on a tablet — as the dashboard sets them. */
const CELL = { xs: 12, sm: 6, md: 3 } as const;

/**
 * The four figures that describe the account.
 *
 * A grid, not a row of shrink-to-fit cards: in a Stack each card was as wide as
 * its own longest word, so "Sent" came out half the width of "Awaiting
 * approval" and the four read as an accident rather than as one set of figures.
 */
export function LedgerTotals({ account }: { account: LedgerPage | undefined }) {
  const pending = account?.pending_out ?? 0;

  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid size={CELL}>
        <Tile label="Balance" value={money(account?.balance ?? 0)} fill="brand" icon={BalanceIcon} />
      </Grid>
      <Grid size={CELL}>
        <Tile
          label="Received"
          value={money(account?.credit_total ?? 0)}
          fill="settled"
          icon={ReceivedIcon}
        />
      </Grid>
      <Grid size={CELL}>
        <Tile label="Sent" value={money(account?.debit_total ?? 0)} fill="brand" icon={SentIcon} />
      </Grid>
      <Grid size={CELL}>
        {/*
          Amber only while something is actually waiting. A permanent warning
          colour over a zero is a warning nobody reads.
        */}
        <Tile
          label="Awaiting approval"
          value={money(pending)}
          fill={pending > 0 ? 'waiting' : 'plain'}
          icon={AwaitingIcon}
        />
      </Grid>
    </Grid>
  );
}

/** The statement itself. `footer` is the pager, when the caller pages it. */
export function LedgerTable({
  entries,
  loading,
  error,
  title = 'Ledger',
  count,
  footer,
}: {
  entries: LedgerEntry[];
  loading: boolean;
  error: string | null;
  title?: string;
  count?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Panel title={title} count={count} footer={footer}>
      <TableFrame
        loading={loading}
        error={error}
        empty={entries.length === 0}
        emptyText="Nothing has moved through this account yet."
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Reference</TableCell>
              <TableCell>Remark</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Credit</TableCell>
              <TableCell align="right">Debit</TableCell>
              <TableCell align="right">Balance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id} hover>
                <TableCell>{e.date?.slice(0, 10) ?? '—'}</TableCell>
                <TableCell className="mono">{e.transaction_no ?? `#${e.id}`}</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>
                  {e.remark ?? e.type ?? '—'}
                </TableCell>
                <TableCell>
                  <StatusChip status={e.status} />
                </TableCell>
                {/*
                  Two columns rather than one signed figure: a statement is read
                  down its credit column or down its debit column, and a minus
                  sign in a shared column is the thing people miss.
                */}
                <TableCell align="right" className="tabular">
                  {e.direction === 'credit' ? money(e.amount) : '—'}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {e.direction === 'debit' ? money(e.amount) : '—'}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(e.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </Panel>
  );
}
