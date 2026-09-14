import { db } from '../db/index.js';
import { sql, type Kysely, type SqlBool } from 'kysely';
import type { DB } from '../db/types.js';
import { badRequest } from '../lib/errors.js';
import { ROLE, type SessionUser } from '../middleware/auth.js';

/**
 * Commission and ledger.
 *
 * A laboratory owes the administrator commission on what it certifies. The
 * rate is per laboratory, held in `users.commision`, and `commission_type`
 * says how to read it — a percentage of what was collected, or a flat amount
 * for each piece. The payment is recorded as a transaction of type `commision`
 * — the column value is spelled that way in the data and must stay spelled
 * that way.
 *
 *   comission_on = the collected amount the commission is calculated on
 *   amount       = the commission itself: comission_on × rate ÷ 100 on a
 *                  percentage, or pieces × rate on per-piece terms
 *
 * The Laravel version takes both figures from the request, so a laboratory can
 * post any commission it likes against any base. Here the base is supplied and
 * the amount is derived from the laboratory's own configured rate.
 *
 * The live data confirms the rate: laboratory 4 is configured at 10.00 and its
 * one commission row is 10 on a base of 100.
 */

/** transaction_type values in use. Spelling matches the stored data. */
export const TRANSACTION_TYPE = {
  ORDER_COLLECTION: 'collected_by_order',
  WALLET_TRANSFER: 'wallet_transfer',
  COMMISSION: 'commision',
  /*
    Money an employee spent out of what they hold — fuel, a courier, stationery.

    Recorded with their employer as `received_by`, which is the **approver and
    not a recipient**: nothing is received. That is what lets it ride the
    existing approval path untouched — the receiver-only decision, the queue,
    the bell. Every sum of `received_by` must therefore leave these rows out, or
    an employee's expense reads as money their laboratory took in.
  */
  EXPENSE: 'expense',
} as const;

/**
 * Rows that are money this user genuinely received: everything addressed to
 * them except an expense they were only asked to approve.
 *
 * Written as `IS NULL OR <> 'expense'` and not `<> 'expense'` alone. The older
 * rows carry no type at all, and in SQL `NULL <> 'expense'` is NULL rather than
 * true — so the short form would quietly drop every untyped row from every
 * balance it was used in.
 */
export const notAnExpense = (eb: any) =>
  eb.or([
    eb('transaction_type', 'is', null),
    eb('transaction_type', '!=', TRANSACTION_TYPE.EXPENSE),
  ]);

const STATUS = { PENDING: 0, APPROVED: 1, DECLINED: 2 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CommissionInput {
  /**
   * What is being sent.
   *
   * Given, it is the payment: a laboratory settling its account types the
   * figure it is actually transferring, and head office approves or declines
   * it — which is the check that matters, since nothing moves until it does.
   *
   * Absent, the amount is still worked out from the laboratory's own terms, so
   * the endpoint remains usable without the panel.
   */
  amount?: number;
  /** The collection the commission is reckoned against. Context, when `amount` is given. */
  commission_on?: number;
  /** Pieces certified, for a laboratory paid per piece rather than a percentage. */
  pieces?: number;
  pay_mode?: string;
  transaction_no?: string | null;
  remark?: string | null;
  attachment?: string | null;
}

export function validateCommissionInput(body: unknown): CommissionInput {
  const b = (body ?? {}) as Record<string, unknown>;

  let amount: number | undefined;
  if (b.amount !== undefined && b.amount !== null && b.amount !== '') {
    amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest('Enter an amount above zero.');
    }
  }

  // The base is required only when it is doing the arithmetic. With an amount
  // in hand it is context, and a laboratory paying off an old balance has no
  // single collection to name.
  let base: number | undefined;
  if (b.commission_on !== undefined && b.commission_on !== null && b.commission_on !== '') {
    base = Number(b.commission_on);
    if (!Number.isFinite(base) || base <= 0) {
      throw badRequest('The collected amount must be above zero.');
    }
  }
  if (amount === undefined && base === undefined) {
    throw badRequest('Enter the amount to send, or the collected amount it is calculated on.');
  }

  // Only meaningful for a per-piece laboratory, and checked here rather than
  // there so a nonsense value is refused before anything is written.
  let pieces: number | undefined;
  if (b.pieces !== undefined && b.pieces !== null && b.pieces !== '') {
    pieces = Number(b.pieces);
    if (!Number.isInteger(pieces) || pieces <= 0) {
      throw badRequest('Pieces must be a whole number above zero.');
    }
  }

  return {
    amount,
    commission_on: base,
    pieces,
    pay_mode: b.pay_mode ? String(b.pay_mode) : 'cash',
    transaction_no: b.transaction_no ? String(b.transaction_no) : null,
    remark: b.remark ? String(b.remark) : null,
    attachment: b.attachment ? String(b.attachment) : null,
  };
}

export interface CommissionResult {
  id: number;
  commission_on: number;
  /** The configured rate, and how it was read. */
  rate: number;
  commission_type: string;
  amount: number;
}

/** Records a commission payment from a laboratory to the administrator. */
export async function sendCommission(
  user: SessionUser,
  input: CommissionInput,
): Promise<CommissionResult> {
  if (user.roleId !== ROLE.LAB) {
    throw badRequest('Only a laboratory account can send commission.');
  }

  const lab = await db
    .selectFrom('users')
    .select(['id', 'commision', 'commission_type'])
    .where('id', '=', user.id)
    .executeTakeFirstOrThrow();

  const rate = Number(lab.commision ?? 0);
  const perPiece = lab.commission_type === COMMISSION_TYPE.PER_PIECE;

  /*
    What is being sent.

    A stated amount is taken as given: this is a payment, and a laboratory
    settling its account knows what it is transferring — an old balance, a part
    payment, a round figure agreed on the phone. Nothing moves on it until head
    office approves the row, which is the check that matters.

    Without one the amount is still derived from the laboratory's own terms — a
    percentage of the collection, or a flat rate for each piece — so the
    endpoint works without a form in front of it, and so a rate that has been
    configured is not simply ignored.
  */
  let amount: number;
  if (input.amount !== undefined) {
    amount = round2(input.amount);
  } else {
    if (rate <= 0) {
      throw badRequest(
        'No commission rate is set for this laboratory, so an amount cannot be worked out. Send the amount, or ask the administrator to set a rate.',
      );
    }
    if (perPiece && !input.pieces) {
      throw badRequest('This laboratory is paid per piece. Send the number of pieces certified, or the amount.');
    }
    amount = round2(
      perPiece ? (input.pieces ?? 0) * rate : ((input.commission_on ?? 0) * rate) / 100,
    );
  }

  if (amount <= 0) throw badRequest('There is nothing to send.');

  const result = await db
    .insertInto('transactions')
    .values({
      amount: String(amount),
      // Null when the payment names no single collection: an account settled
      // in one figure is not reckoned against one order's takings.
      comission_on: input.commission_on ?? null,
      transaction_type: TRANSACTION_TYPE.COMMISSION,
      pay_mode: input.pay_mode ?? 'cash',
      transaction_no: input.transaction_no,
      remark: input.remark,
      attachment: input.attachment,
      send_by: user.id,
      // Commission always goes to the administrator, user 1.
      received_by: ROLE.SUPER,
      status: STATUS.PENDING,
      seen_by_sender: 1,
      seen_by_receiver: 0,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .executeTakeFirst();

  return {
    id: Number(result.insertId),
    commission_on: input.commission_on ?? 0,
    rate,
    commission_type: perPiece ? COMMISSION_TYPE.PER_PIECE : COMMISSION_TYPE.PERCENT,
    amount,
  };
}

/** How a laboratory's rate is read. `users.commission_type`. */
export const COMMISSION_TYPE = { PERCENT: 'percent', PER_PIECE: 'per_pc' } as const;

/**
 * What each laboratory has earned but not necessarily been paid.
 *
 * One helper, because three screens report this figure — the laboratory list,
 * one laboratory's page and the dashboard — and three copies of the same
 * arithmetic is how the dashboard and the list came to disagree about what a
 * franchise is owed.
 *
 * The rate is read two ways, and which one applies is on the laboratory:
 *
 *   percent  what it has collected, times the rate, over 100
 *   per_pc   the pieces on the orders it collected on, times the rate — the
 *            money the order was worth does not enter into it
 *
 * An order enters the commission books once it has been delivered *or* once
 * money has been taken on it. Paying and delivering became separate acts, and
 * gating this on delivery alone meant a laboratory could hold a counter full of
 * customers' money with the commission tiles reading zero — while its own
 * dashboard, which reads the wallet rather than this, already showed the
 * administrator's share. The old Laravel figure applies the rate to what was
 * received too, so this is the collection that has always been billed.
 *
 * Collected and pieces are counted in two queries rather than one join: joining
 * `order_details` to `orders` repeats each order's `paid_amount` once per line
 * on it, which silently multiplies the collection of any order with more than
 * one line.
 *
 * `labId` narrows it to one laboratory; without it the map covers them all.
 * `exec` is the pool unless a caller hands it a transaction — which the check
 * does, to read a fixture it has not committed.
 */
export async function accruedByLab(
  labId?: number,
  exec: Kysely<DB> = db,
): Promise<Map<number, number>> {
  let ratesQuery = exec.selectFrom('users').select(['id', 'commision', 'commission_type']);
  if (labId) ratesQuery = ratesQuery.where('id', '=', labId);

  /*
    Delivered, or paid on. `paid_amount` is a varchar, so it is compared as a
    number rather than as text — as text, '50' sorts above '0' for the same
    reason '5' does, and an order with nothing on it but an empty string would
    read as money taken.
  */
  const earning = (eb: any) =>
    eb.or([
      eb('orders.status', '=', 'delivered'),
      sql<SqlBool>`coalesce(orders.paid_amount, 0) + 0 > 0`,
    ]);

  // A deleted order is not earnings, on either set of terms. Qualified as
  // `orders.deleted_at` because the second query reaches the table through a
  // join, where the bare column name is ambiguous.
  let collectedQuery = exec
    .selectFrom('orders')
    .where('orders.deleted_at', 'is', null)
    .select(({ fn }) => [
      'orders.lab_id as lab_id',
      fn.sum<number>('orders.paid_amount').as('total'),
    ])
    .where(earning)
    .groupBy('orders.lab_id');
  if (labId) collectedQuery = collectedQuery.where('orders.lab_id', '=', labId);

  let piecesQuery = exec
    .selectFrom('order_details')
    .innerJoin('orders', 'orders.id', 'order_details.order_id')
    .where('orders.deleted_at', 'is', null)
    .select(({ fn }) => [
      'orders.lab_id as lab_id',
      fn.sum<number>('order_details.qty').as('total'),
    ])
    .where(earning)
    .groupBy('orders.lab_id');
  if (labId) piecesQuery = piecesQuery.where('orders.lab_id', '=', labId);

  const [rates, collected, pieces] = await Promise.all([
    ratesQuery.execute(),
    collectedQuery.execute(),
    piecesQuery.execute(),
  ]);

  const totals = (rows: { lab_id: number; total: number | null }[]) =>
    new Map(rows.map((r) => [Number(r.lab_id), Number(r.total) || 0]));
  const money = totals(collected);
  const qty = totals(pieces);

  return new Map(
    rates.map((lab) => {
      const rate = Number(lab.commision) || 0;
      const earned =
        lab.commission_type === COMMISSION_TYPE.PER_PIECE
          ? (qty.get(Number(lab.id)) ?? 0) * rate
          : ((money.get(Number(lab.id)) ?? 0) * rate) / 100;
      return [Number(lab.id), round2(earned)] as const;
    }),
  );
}

/** One order's contribution to what a laboratory owes. */
export interface CommissionEarning {
  order_id: number;
  order_no: string;
  order_date: string | null;
  status: string;
  lab_id: number;
  lab_name: string | null;
  /** Taken on the order. The base on percentage terms. */
  collected: number;
  /** Pieces on it. The base on per-piece terms. */
  pieces: number;
  rate: number;
  commission_type: string;
  commission: number;
}

/**
 * Where the accrued figure comes from, order by order.
 *
 * The commission screen could say a laboratory owed 30 and show an empty table
 * underneath it, because the only list it had was of remittances — and a
 * franchise that has never remitted has none. The number and the evidence for
 * it were on the same screen with nothing joining them.
 *
 * Same orders, same gate and same rate as `accruedByLab`, so these rows add up
 * to the tile above them: an order counts once it has been delivered or once
 * money has been taken on it, and it is worth a share of what was collected or
 * a flat amount per piece, on the laboratory's own terms.
 *
 * Rounded per order for display. The tile rounds the sum instead, so a hundred
 * orders can leave the two a paisa apart; the tile is the figure that is owed.
 */
export async function commissionEarnings(
  labId?: number,
  limit = 100,
  offset = 0,
): Promise<{ entries: CommissionEarning[]; total: number }> {
  let ratesQuery = db.selectFrom('users').select(['id', 'fullname', 'commision', 'commission_type']);
  if (labId) ratesQuery = ratesQuery.where('id', '=', labId);
  const rates = await ratesQuery.execute();
  const rateOf = new Map(rates.map((r) => [Number(r.id), r]));

  const earning = (eb: any) =>
    eb.or([
      eb('orders.status', '=', 'delivered'),
      sql<SqlBool>`coalesce(orders.paid_amount, 0) + 0 > 0`,
    ]);

  let ordersQuery = db
    .selectFrom('orders')
    .select(['id', 'order_no', 'order_date', 'status', 'lab_id', 'paid_amount'])
    .where('orders.deleted_at', 'is', null)
    .where(earning);
  let countQuery = db
    .selectFrom('orders')
    .select(db.fn.countAll().as('n'))
    .where('orders.deleted_at', 'is', null)
    .where(earning);
  if (labId) {
    ordersQuery = ordersQuery.where('orders.lab_id', '=', labId);
    countQuery = countQuery.where('orders.lab_id', '=', labId);
  }

  const [orders, count] = await Promise.all([
    ordersQuery.orderBy('id', 'desc').limit(limit).offset(offset).execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  // Pieces for the page's orders in one query rather than one per row: a line
  // carrying two card kinds is still one line of stones, so this is the raw
  // quantity, the same figure the accrual sums.
  const ids = orders.map((o) => Number(o.id));
  const lines = ids.length
    ? await db
        .selectFrom('order_details')
        .select(({ fn }) => ['order_id', fn.sum<number>('qty').as('total')])
        .where('order_id', 'in', ids)
        .groupBy('order_id')
        .execute()
    : [];
  const piecesOf = new Map(lines.map((l) => [Number(l.order_id), Number(l.total) || 0]));

  const entries = orders.map((o) => {
    const lab = rateOf.get(Number(o.lab_id));
    const rate = Number(lab?.commision) || 0;
    const perPiece = lab?.commission_type === COMMISSION_TYPE.PER_PIECE;
    const collected = Number(o.paid_amount) || 0;
    const pieces = piecesOf.get(Number(o.id)) ?? 0;

    return {
      order_id: Number(o.id),
      order_no: o.order_no,
      order_date: o.order_date,
      status: o.status,
      lab_id: Number(o.lab_id),
      lab_name: lab?.fullname ?? null,
      collected,
      pieces,
      rate,
      commission_type: perPiece ? COMMISSION_TYPE.PER_PIECE : COMMISSION_TYPE.PERCENT,
      commission: round2(perPiece ? pieces * rate : (collected * rate) / 100),
    };
  });

  return { entries, total: Number(count.n) };
}

export interface LedgerEntry {
  id: number;
  date: Date | null;
  type: string | null;
  direction: 'credit' | 'debit';
  amount: number;
  status: number;
  counterparty: number;
  /**
   * Who that is, by name. A statement that says "#26" is a statement somebody
   * has to look up before they can read it, and the id is head office's key,
   * not anything written on paper.
   *
   * Null where the row names nobody — `send_by` is 0 on money taken at the
   * counter from a walk-in customer, who has no account.
   */
  counterparty_name: string | null;
  order_id: number | null;
  pay_mode: string;
  transaction_no: string | null;
  remark: string | null;
  balance: number;
}

/**
 * Running account for one user. Money received is a credit, money sent is a
 * debit, and only approved transactions move the balance — pending and
 * declined rows appear so the history is complete but leave it unchanged.
 */
export interface LedgerPage {
  entries: LedgerEntry[];
  /** Approved money in, within the period asked for (the whole history when none). */
  credit_total: number;
  /** Approved money out, within the period. */
  debit_total: number;
  /** Where the account stood before the period began. Zero with no period. */
  opening_balance: number;
  /** Where it stood at the end of the period: opening, plus credit, less debit. */
  balance: number;
  pending_out: number;
  pending_in: number;
  total: number;
  offset: number;
  limit: number;
}

export interface ExpenseWallet {
  /** Approved floats received from the employer. */
  transfers_in: number;
  /** Approved expenses recorded against it. */
  expenses: number;
  /** Expenses recorded and not yet approved. Not taken off the balance. */
  pending_expenses: number;
  /**
   * transfers_in less expenses. **May be negative**: an employee who paid a
   * courier out of their own pocket is owed it, and a negative float says so
   * rather than the expense being refused and pushed off the books.
   */
  balance: number;
}

/**
 * Each employee's expense float, in one query however many are asked for.
 *
 * Grouped over the rows rather than read per person, because the staff list
 * shows a column of these and a query per row is the shape that made the
 * Laravel order list slow.
 */
export async function expenseWallets(userIds: number[]): Promise<Map<number, ExpenseWallet>> {
  const out = new Map<number, ExpenseWallet>();
  for (const id of userIds) out.set(id, { transfers_in: 0, expenses: 0, pending_expenses: 0, balance: 0 });
  if (userIds.length === 0) return out;

  const [floats, spent] = await Promise.all([
    db
      .selectFrom('transactions')
      .select(['received_by as uid', db.fn.sum<number>('amount').as('total')])
      .where('transaction_type', '=', TRANSACTION_TYPE.WALLET_TRANSFER)
      .where('received_by', 'in', userIds)
      .where('status', '=', STATUS.APPROVED)
      .groupBy('received_by')
      .execute(),
    db
      .selectFrom('transactions')
      .select(['send_by as uid', 'status', db.fn.sum<number>('amount').as('total')])
      .where('transaction_type', '=', TRANSACTION_TYPE.EXPENSE)
      .where('send_by', 'in', userIds)
      .where('status', 'in', [STATUS.APPROVED, STATUS.PENDING])
      .groupBy(['send_by', 'status'])
      .execute(),
  ]);

  for (const r of floats) {
    const w = out.get(Number(r.uid));
    if (w) w.transfers_in = round2(Number(r.total ?? 0));
  }
  for (const r of spent) {
    const w = out.get(Number(r.uid));
    if (!w) continue;
    if (Number(r.status) === STATUS.APPROVED) w.expenses = round2(Number(r.total ?? 0));
    else w.pending_expenses = round2(Number(r.total ?? 0));
  }
  for (const w of out.values()) w.balance = round2(w.transfers_in - w.expenses);
  return out;
}

/**
 * Which of an employee's two wallets a ledger is read over.
 *
 * An employee holds two kinds of money that must not mix. **Collection** is
 * what customers paid them at the counter: it belongs to the laboratory and is
 * handed on. **Expense** is a float the laboratory sent them to spend on its
 * behalf — fuel, a courier — and what they spend comes out of that, not out of
 * a customer's money.
 *
 * `all` is the account as one statement, which is what a laboratory and head
 * office have: they hold no float, so there is nothing to separate.
 */
export type LedgerScope = 'all' | 'collection' | 'expense';

/** A float sent to this user: a transfer they received. */
const isFloatIn = (row: { transaction_type: string | null; received_by: number | string }, userId: number) =>
  row.transaction_type === TRANSACTION_TYPE.WALLET_TRANSFER && Number(row.received_by) === userId;

/** An expense this user recorded against their float. */
const isExpenseOut = (row: { transaction_type: string | null; send_by: number | string }, userId: number) =>
  row.transaction_type === TRANSACTION_TYPE.EXPENSE && Number(row.send_by) === userId;

export async function ledgerFor(
  userId: number,
  limit = 100,
  offset = 0,
  scope: LedgerScope = 'all',
  /** Inclusive `YYYY-MM-DD` bounds. Either may be left off. */
  period: { from?: string | null; to?: string | null } = {},
  /**
   * Narrow the rows listed: one status, and/or a reference to look for.
   *
   * These choose which rows are shown, not which rows count. Every running
   * balance and every total is still the account's over the whole period, so a
   * row found by its reference shows where the account really stood after it.
   */
  filter: { status?: number | null; q?: string | null; mode?: string | null } = {},
): Promise<LedgerPage> {
  // What I sent, and what I received — but not an expense I was only asked to
  // approve, which is not money that reached me and must not credit my balance.
  const mine = (eb: any) =>
    eb.or([eb('send_by', '=', userId), eb.and([eb('received_by', '=', userId), notAnExpense(eb)])]);

  // The whole history is read because the running balance on any entry depends
  // on every entry before it, and the totals describe the account rather than
  // the page. Only the returned slice is built into objects, so a long history
  // costs one scan rather than one response the size of the account.
  const every = await db
    .selectFrom('transactions')
    .select(['id', 'amount', 'send_by', 'received_by', 'status', 'transaction_type', 'order_id', 'pay_mode', 'transaction_no', 'remark', 'created_at'])
    .where(mine)
    .orderBy('id')
    .execute();

  /*
    Scoped here, in the walk, rather than in the query.

    The collection wallet is "everything except the float and what was spent
    from it", and in SQL that is a NOT over a comparison with a nullable column.
    The oldest rows carry no transaction_type, `NULL = 'wallet_transfer'` is
    NULL rather than false, and NOT NULL is NULL too — so every untyped row would
    quietly vanish from the collection wallet. In JavaScript a missing type is
    simply not equal.

    The running balance is then worked over the scoped rows alone, which is what
    makes each wallet's balance its own.
  */
  const inExpense = (r: (typeof every)[number]) => isFloatIn(r, userId) || isExpenseOut(r, userId);
  const scoped =
    scope === 'expense'
      ? every.filter(inExpense)
      : scope === 'collection'
        ? every.filter((r) => !inExpense(r))
        : every;

  /*
    A month, or any two dates — a statement for a period.

    Filtered after the whole history is read, not in the query, because a
    period's first row does not start from zero: it starts from wherever the
    account stood that morning. Everything approved before the period is
    folded into an opening balance and left off the list, so each running
    balance on the page is still the account's real balance on that day and not
    a count restarted at the top of the month.

    Anything after the period is simply not included. The closing balance is
    where the account stood at the end of the last day asked for.

    Days are compared the way the statement prints them — the first ten
    characters of the ISO timestamp — so a row filed under the 1st on screen is
    the row a filter from the 1st returns.
  */
  const dayOf = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const start = period.from || null;
  const end = period.to || null;
  let opening = 0;
  const rows: typeof scoped = [];
  for (const r of scoped) {
    const day = dayOf(r.created_at);
    if (start && day < start) {
      if (Number(r.status) === STATUS.APPROVED) {
        const amount = Number(r.amount) || 0;
        opening += Number(r.received_by) === userId ? amount : -amount;
      }
      continue;
    }
    if (end && day > end) continue;
    rows.push(r);
  }

  /*
    Newest first, but counted oldest first.

    The running balance on any entry is every entry before it, so the walk has
    to go forward through time whatever order the page is read in. What changes
    is which slice of that walk is kept: page one of a newest-first list is the
    **last** rows of the history, not the first, and the page is reversed once
    it is built.

    Getting this wrong is quiet — the balances stay right and the wrong rows
    come back — so the window is worked out from the end explicitly.
  */
  /*
    Two passes.

    The first walks every row of the period forward and settles what each one
    left the balance at, with the period's totals. The second picks the rows
    that match the status and reference asked for, and pages over those.

    In one pass the page window was counted over every row, so filtering would
    have paged over rows that were then thrown away — page one of "Pending" coming
    back with two rows and a claim of nine pages. Filtering after the walk also
    keeps each listed row's balance the real one rather than a total of only
    the rows that happened to match.
  */
  let balance = opening;
  let creditTotal = 0;
  let debitTotal = 0;
  let pendingOut = 0;
  let pendingIn = 0;
  const after: number[] = [];

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const isCredit = Number(row.received_by) === userId;
    const status = Number(row.status);

    if (status === STATUS.APPROVED) {
      if (isCredit) {
        creditTotal += amount;
        balance += amount;
      } else {
        debitTotal += amount;
        balance -= amount;
      }
    } else if (status === STATUS.PENDING) {
      if (isCredit) pendingIn += amount;
      else pendingOut += amount;
    }
    after.push(balance);
  }

  // A reference is what is printed on the row: the transaction number, or the
  // `#id` shown when there is none. Matched loosely, because it is typed from a
  // slip of paper.
  const wantStatus = filter.status ?? null;
  // Compared without case: the Laravel rows were typed by hand as well as
  // chosen from a list, so `Cash` and `cash` are the same way of paying.
  const wantMode = (filter.mode ?? '').trim().toLowerCase() || null;
  const term = (filter.q ?? '').trim().toLowerCase().replace(/^#/, '');
  const listed: number[] = [];
  rows.forEach((row, i) => {
    if (wantStatus !== null && Number(row.status) !== wantStatus) return;
    if (wantMode && String(row.pay_mode ?? '').trim().toLowerCase() !== wantMode) return;
    if (term) {
      const ref = String(row.transaction_no ?? '').toLowerCase();
      if (!ref.includes(term) && String(row.id) !== term) return;
    }
    listed.push(i);
  });

  /*
    Newest first, but counted oldest first.

    The page window is worked out from the end of the listed rows: page one of a
    newest-first list is the **last** rows, not the first, and the page is
    reversed once it is built.
  */
  const asked = Math.max(0, offset);
  const size = Math.max(1, limit);
  const from = Math.max(0, listed.length - (asked + size));
  const to = listed.length - asked;

  const entries: LedgerEntry[] = [];
  for (const i of listed.slice(from, to)) {
    const row = rows[i];
    const amount = Number(row.amount) || 0;
    const isCredit = Number(row.received_by) === userId;

    entries.push({
      id: Number(row.id),
      date: row.created_at,
      type: row.transaction_type,
      direction: isCredit ? 'credit' : 'debit',
      amount,
      status: Number(row.status),
      counterparty: isCredit ? Number(row.send_by) : Number(row.received_by),
      // Filled in below, once the page is known: one query for the names on it
      // rather than one per row.
      counterparty_name: null,
      order_id: row.order_id === null ? null : Number(row.order_id),
      pay_mode: row.pay_mode,
      transaction_no: row.transaction_no,
      remark: row.remark,
      balance: round2(after[i]),
    });
  }

  /*
    The other party's name, for the page that is being returned.

    One query over the ids actually on it — the history behind the running
    balance can be the whole account, and naming every party in it would be a
    join over rows nobody is going to see.
  */
  const ids = [...new Set(entries.map((e) => e.counterparty).filter((id) => id > 0))];
  if (ids.length) {
    const named = await db
      .selectFrom('users')
      .select(['id', 'fullname'])
      .where('id', 'in', ids)
      .execute();
    const byId = new Map(named.map((u) => [Number(u.id), String(u.fullname)]));
    for (const e of entries) e.counterparty_name = byId.get(e.counterparty) ?? null;
  }

  /*
    The customer, for money taken at the counter.

    `send_by` is 0 on those rows — a walk-in has no account, and 0 is the
    sentinel for "nobody", which is why the column cannot name them. The order
    can: it carries the name that was written on it when the order was taken,
    and the transaction names the order.

    So the party on a collection is the customer who paid, not the word
    "Customer" standing in for every one of them.
  */
  const orderIds = [
    ...new Set(
      entries
        .filter((e) => !e.counterparty_name && e.order_id)
        .map((e) => Number(e.order_id)),
    ),
  ];
  if (orderIds.length) {
    const orders = await db
      .selectFrom('orders')
      .select(['id', 'customer_name'])
      .where('id', 'in', orderIds)
      .execute();
    const byOrder = new Map(
      orders
        .filter((o) => o.customer_name && String(o.customer_name).trim())
        .map((o) => [Number(o.id), String(o.customer_name).trim()]),
    );
    for (const e of entries) {
      if (!e.counterparty_name && e.order_id) {
        e.counterparty_name = byOrder.get(Number(e.order_id)) ?? null;
      }
    }
  }

  // The slice was gathered oldest first, because that is the only order the
  // balance can be worked out in. The statement is read the other way round.
  entries.reverse();

  return {
    entries,
    credit_total: round2(creditTotal),
    debit_total: round2(debitTotal),
    opening_balance: round2(opening),
    balance: round2(balance),
    pending_out: round2(pendingOut),
    pending_in: round2(pendingIn),
    total: listed.length,
    offset: from,
    limit: to - from,
  };
}
