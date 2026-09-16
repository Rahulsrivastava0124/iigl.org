import { Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import ApproveIcon from '@mui/icons-material/CheckCircleOutlined';
import DeclineIcon from '@mui/icons-material/CancelOutlined';
import BalanceIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ReceivedIcon from '@mui/icons-material/SouthWestOutlined';
import SentIcon from '@mui/icons-material/NorthEastOutlined';
import AwaitingIcon from '@mui/icons-material/HourglassEmptyOutlined';
import { Panel, StatusChip, TableFrame, Tile, TILE_CELL, ToneAction, money } from './ui';
import { payModeLabel } from '../lib/payModes';

/**
 * The running account: what came in, what went out, and the balance after each.
 *
 * Wallet's screen. It was on Transactions too, as a Ledger tab, which was the
 * same statement over the same movements under a second name; the tab is gone
 * and the pieces stay here, because a second rendering of one statement is a
 * second chance for a column to say something different about the same rupee.
 */

/** One line of the running account, as `/transactions/ledger` returns it. */
export interface LedgerEntry {
  id: number;
  date: string | null;
  type: string | null;
  direction: 'credit' | 'debit';
  amount: number;
  status: number;
  /** The other side of the movement, and who that is. */
  counterparty: number;
  counterparty_name: string | null;
  order_id: number | null;
  /** How it was paid: `cash`, `upi`, `card`, `bank`, `cheque`, or older free text. */
  pay_mode: string | null;
  transaction_no: string | null;
  remark: string | null;
  balance: number;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  /** Approved money in, within the period asked for. */
  credit_total: number;
  /** Approved money out, within the period. */
  debit_total: number;
  /** Where the account stood before the period began. Zero with no period. */
  opening_balance: number;
  /** Where it stood at the end of the period. */
  balance: number;
  pending_out: number;
  pending_in: number;
  /** The payment modes stored on the period's rows, lower-cased. */
  modes?: string[];
  total: number;
}

/** The panel's one card width. */
const CELL = TILE_CELL;

/**
 * The four figures that describe the account.
 *
 * A grid, not a row of shrink-to-fit cards: in a Stack each card was as wide as
 * its own longest word, so "Sent" came out half the width of "Awaiting
 * approval" and the four read as an accident rather than as one set of figures.
 */
export function LedgerTotals({
  account,
  period = false,
}: {
  account: LedgerPage | undefined;
  /**
   * A month or a date range is chosen. The balance is then the closing balance
   * for it, and says what it opened at, so the two totals beside it can be
   * checked against it: opening, plus credit, less debit.
   */
  period?: boolean;
}) {
  /*
    Money that has not moved yet, and whose move it is.

    The tile read `pending_out` alone — what this account has sent and is
    waiting to have approved — and so showed head office a nought while a
    laboratory's remittance sat in the very list underneath, waiting on head
    office to decide it. Both directions are pending; which one matters depends
    on which end of it you are.

    Incoming takes precedence because it is the one with something to do.
  */
  const incoming = account?.pending_in ?? 0;
  const outgoing = account?.pending_out ?? 0;
  const pending = incoming > 0 ? incoming : outgoing;

  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid size={CELL}>
        {/*
          Green while there is money in it, red once it goes below zero. Below
          zero is somebody being owed — an expense float spent past what was
          handed over — and that is the one balance here that needs acting on.
        */}
        <Tile
          label={period ? 'Closing balance' : 'Balance'}
          value={money(account?.balance ?? 0)}
          note={period ? `opened at ${money(account?.opening_balance ?? 0)}` : undefined}
          fill={(account?.balance ?? 0) < 0 ? 'refused' : 'settled'}
          icon={BalanceIcon}
        />
      </Grid>
      <Grid size={CELL}>
        <Tile
          label="Total credit"
          value={money(account?.credit_total ?? 0)}
          fill="settled"
          icon={ReceivedIcon}
        />
      </Grid>
      <Grid size={CELL}>
        <Tile label="Total debit" value={money(account?.debit_total ?? 0)} fill="brand" icon={SentIcon} />
      </Grid>
      <Grid size={CELL}>
        {/*
          Amber only while something is actually waiting. A permanent warning
          colour over a zero is a warning nobody reads.
        */}
        <Tile
          label={incoming > 0 ? 'Awaiting your approval' : 'Awaiting approval'}
          value={money(pending)}
          note={
            incoming > 0 && outgoing > 0
              ? `${money(outgoing)} of yours is waiting too`
              : undefined
          }
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
  actions,
  bare,
  onDecide,
  deciding,
}: {
  entries: LedgerEntry[];
  loading: boolean;
  error: string | null;
  title?: string;
  count?: string;
  footer?: React.ReactNode;
  /** Controls for the header row, beside the title: the period filter. */
  actions?: React.ReactNode;
  /**
   * Render the table alone, without the panel around it.
   *
   * For a caller that has already opened a panel and is putting this in one of
   * its tabs — the wallet does, beside the commission statements. Nesting a
   * panel inside a panel draws two borders around one table and gives it two
   * titles, one of which is the tab that was just clicked.
   */
  bare?: boolean;
  /**
   * Accept or decline a pending movement from the row it is on.
   *
   * Offered only on money this account *received* and has not yet decided:
   * deciding belongs to the receiver, and the API refuses it from anybody
   * else, so a button on a row somebody sent would be a button that errors.
   * Without this the table stays read-only, which is what every other caller
   * wants.
   */
  onDecide?: (id: number, next: 1 | 2) => void;
  /** The row a decision is in flight for; its buttons stop taking clicks. */
  deciding?: number | null;
}) {
  const table = (
    <>
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
              {/*
                Who the money moved between. A statement without it is a column
                of figures nobody can attribute — and the id it was carrying is
                head office's key, not anything written on paper.
              */}
              <TableCell>Party</TableCell>
              <TableCell>Remark</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Payment type</TableCell>
              <TableCell align="right">Credit</TableCell>
              <TableCell align="right">Debit</TableCell>
              <TableCell align="right">Balance</TableCell>
              {onDecide && <TableCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id} hover>
                <TableCell>{e.date?.slice(0, 10) ?? '—'}</TableCell>
                <TableCell className="mono">{e.transaction_no ?? `#${e.id}`}</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', minWidth: 130 }}>
                  {/*
                    `send_by` is 0 on money taken at the counter — a walk-in has
                    no account — so those rows are named from the order the
                    money was against, which carries the customer's name.

                    "Customer" is the last resort, for a collection with no
                    order behind it or an order with no name on it. Better than
                    a dash, which reads as missing rather than as anonymous.
                  */}
                  {/* An expense is stored against the employer who approves it,
                      so the counterparty on the row is that laboratory — which
                      would read as money sent to it. It went nowhere; it was spent. */}
                  {e.type === 'expense'
                    ? 'Expense'
                    : (e.counterparty_name ?? (e.counterparty > 0 ? `#${e.counterparty}` : 'Customer'))}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>
                  {e.remark ?? e.type ?? '—'}
                </TableCell>
                <TableCell>
                  <StatusChip status={e.status} />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{payModeLabel(e.pay_mode)}</TableCell>
                {/*
                  Two columns rather than one signed figure: a statement is read
                  down its credit column or down its debit column, and a minus
                  sign in a shared column is the thing people miss.
                */}
                {/*
                  The figure is bold, the dash is not: a statement is scanned
                  down one money column, and weighting the empty cells as
                  heavily as the amounts is what made it a grid to read rather
                  than a column to run an eye down.
                */}
                <TableCell
                  align="right"
                  className="tabular"
                  sx={{
                    fontWeight: e.direction === 'credit' ? 600 : 400,
                    // The colour is on the figure, not the empty cell: a green
                    // dash says money came in on a row where none did.
                    color: e.direction === 'credit' ? 'success.main' : 'text.disabled',
                  }}
                >
                  {e.direction === 'credit' ? money(e.amount) : '—'}
                </TableCell>
                <TableCell
                  align="right"
                  className="tabular"
                  sx={{
                    fontWeight: e.direction === 'debit' ? 600 : 400,
                    color: e.direction === 'debit' ? 'error.main' : 'text.disabled',
                  }}
                >
                  {e.direction === 'debit' ? money(e.amount) : '—'}
                </TableCell>
                {/*
                  Bold, because the running balance is the figure people read
                  this statement for: where the account stood after each
                  movement. It is weighted the same as the credit or debit on
                  the row and takes no colour of its own, so the direction of
                  the movement is still carried by that column alone.
                */}
                <TableCell align="right" className="tabular" sx={{ fontWeight: 700 }}>
                  {money(e.balance)}
                </TableCell>
                {onDecide && (
                  <TableCell>
                    {e.status === 0 && e.direction === 'credit' && (
                      <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
                        <ToneAction
                          label="Accept"
                          icon={ApproveIcon}
                          tone="settled"
                          disabled={deciding === e.id}
                          onClick={() => onDecide(e.id, 1)}
                        />
                        <ToneAction
                          label="Decline"
                          icon={DeclineIcon}
                          tone="refused"
                          disabled={deciding === e.id}
                          onClick={() => onDecide(e.id, 2)}
                        />
                      </Stack>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );

  if (bare) return table;

  return (
    <Panel title={title} count={count} footer={footer} actions={actions}>
      {table}
    </Panel>
  );
}
