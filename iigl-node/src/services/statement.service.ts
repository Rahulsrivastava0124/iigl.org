import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { sql, type SqlBool } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, notFound } from '../lib/errors.js';
import { ROLE } from '../middleware/auth.js';
import { COMMISSION_TYPE, TRANSACTION_TYPE } from './commission.service.js';
import { live } from './order.service.js';
import { letterheadHtml } from './letterhead.service.js';

/**
 * Commission statements: head office billing a laboratory on a period.
 *
 * Commission used to be a running figure a laboratory paid down whenever it
 * chose. Now each finished period is billed the day after it ends, falls due
 * `statement_grace_days` later, and a statement still not paid in full after
 * that locks the laboratory's certificate generation until head office
 * approves a payment that covers it.
 *
 * What a period bills is the same commission as everywhere else — the orders
 * delivered or paid on, at the laboratory's own rate — bucketed by the order's
 * date. Payments settle the oldest statement first.
 *
 * ponytail: payments are counted from the billing start, and every one is
 * applied to statements; a payment made after the start towards dues from
 * before it is read as paying a statement. Split them by a reference if head
 * office ever needs the old balance kept apart.
 */

/** Nothing before this is billed, unless a laboratory is given its own start. */
export const STATEMENTS_BEGIN = '2026-09-01';
/** Months per statement. 0 is None: no cycle, one statement billed as of today. */
export const STATEMENT_PERIODS = [0, 1, 3, 6, 12] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const STATUS = { PENDING: 0, APPROVED: 1 } as const;

/* YYYY-MM-DD arithmetic in UTC, so no timezone ever moves a date. */
const toDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const fromDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fromDay(toDay(iso) + n);
const addMonths = (iso: string, n: number) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Today where the office is — the server's own clock — as YYYY-MM-DD. */
export const todayIso = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

/** One order's share, as billed. */
export interface StatementLine {
  id: number;
  order_no: string;
  day: string;
  status: string;
  collected: number;
  pieces: number;
  commission: number;
}

export interface StatementPeriod {
  /** YYYY-MM of the first month, which is how a statement is addressed. */
  key: string;
  from: string;
  to: string;
  billed_on: string;
  due_on: string;
  orders: number;
  pieces: number;
  collected: number;
  commission: number;
  /** What payments, oldest statement first, have covered of this one. */
  paid: number;
  balance: number;
  state: 'paid' | 'due' | 'overdue';
}

export interface StatementBook {
  period_months: number;
  grace_days: number;
  starts_on: string;
  today: string;
  /** Billed statements, newest first. */
  periods: StatementPeriod[];
  /** The period still running, not billed yet. */
  current: { key: string; from: string; to: string; billed_on: string; orders: number; commission: number } | null;
  billed: number;
  paid: number;
  pending: number;
  outstanding: number;
  /** clear: nothing overdue or due. grace: billed, unpaid, inside its grace days. locked: past them. */
  standing: 'clear' | 'grace' | 'locked';
  /** The oldest statement not yet paid in full, for the reminder. */
  reminder: null | {
    key: string;
    amount: number;
    billed_on: string;
    due_on: string;
    days_left: number;
    overdue_days: number;
  };
}

/**
 * The arithmetic, on figures already read — so it can be checked without a
 * database (`npm run check:statements`).
 */
export function buildStatements(input: {
  startsOn: string;
  months: number;
  graceDays: number;
  today: string;
  lines: StatementLine[];
  paid: number;
  pending: number;
}): StatementBook & { linesByKey: Map<string, StatementLine[]> } {
  const months = (STATEMENT_PERIODS as readonly number[]).includes(input.months) ? input.months : 1;
  const grace = Math.max(0, Math.trunc(input.graceDays));
  const startsOn = monthStart(input.startsOn);
  const { today } = input;

  /*
    None (0 months): no billing cycle. Everything since billing started is one
    statement, billed as of today — so it is always up to date, never falls due
    in the past, and never locks certificate generation.
  */
  const none = months === 0;

  const windows: { key: string; from: string; to: string }[] = [];
  if (none) {
    if (startsOn <= today) windows.push({ key: startsOn.slice(0, 7), from: startsOn, to: today });
  } else {
    for (let from = startsOn; from <= today; from = addMonths(from, months)) {
      windows.push({ key: from.slice(0, 7), from, to: addDays(addMonths(from, months), -1) });
    }
  }

  const linesByKey = new Map<string, StatementLine[]>();
  for (const line of input.lines) {
    const w = windows.find((x) => line.day >= x.from && line.day <= x.to);
    if (!w) continue;
    const list = linesByKey.get(w.key) ?? [];
    list.push(line);
    linesByKey.set(w.key, list);
  }
  const sum = (lines: StatementLine[], k: 'collected' | 'pieces' | 'commission') =>
    round2(lines.reduce((t, l) => t + l[k], 0));

  let remaining = round2(input.paid);
  const billedOldestFirst: StatementPeriod[] = windows
    .filter((w) => none || w.to < today)
    .map((w) => {
      const lines = linesByKey.get(w.key) ?? [];
      const commission = sum(lines, 'commission');
      const applied = Math.min(remaining, commission);
      remaining = round2(remaining - applied);
      const balance = round2(commission - applied);
      const billed_on = none ? today : addDays(w.to, 1);
      const due_on = none ? today : addDays(billed_on, grace);
      return {
        ...w,
        billed_on,
        due_on,
        orders: lines.length,
        pieces: sum(lines, 'pieces'),
        collected: sum(lines, 'collected'),
        commission,
        paid: round2(applied),
        balance,
        state: balance <= 0 ? 'paid' : !none && today > due_on ? 'overdue' : 'due',
      };
    });

  const running = none ? undefined : windows.find((w) => w.to >= today);
  const current = running
    ? {
        key: running.key,
        from: running.from,
        to: running.to,
        billed_on: addDays(running.to, 1),
        orders: (linesByKey.get(running.key) ?? []).length,
        commission: sum(linesByKey.get(running.key) ?? [], 'commission'),
      }
    : null;

  const billed = round2(billedOldestFirst.reduce((t, p) => t + p.commission, 0));
  const outstanding = round2(billedOldestFirst.reduce((t, p) => t + p.balance, 0));
  // With no cycle nothing is ever overdue, so there is no reminder and no lock.
  const oldest = none ? undefined : billedOldestFirst.find((p) => p.balance > 0);

  return {
    period_months: months,
    grace_days: grace,
    starts_on: startsOn,
    today,
    periods: [...billedOldestFirst].reverse(),
    current,
    billed,
    paid: round2(input.paid),
    pending: round2(input.pending),
    outstanding,
    standing: billedOldestFirst.some((p) => p.state === 'overdue')
      ? 'locked'
      : oldest
        ? 'grace'
        : 'clear',
    reminder: oldest
      ? {
          key: oldest.key,
          amount: outstanding,
          billed_on: oldest.billed_on,
          due_on: oldest.due_on,
          days_left: Math.max(0, toDay(oldest.due_on) - toDay(today)),
          overdue_days: Math.max(0, toDay(today) - toDay(oldest.due_on)),
        }
      : null,
    linesByKey,
  };
}

async function readLab(labId: number) {
  return db
    .selectFrom('users')
    .select([
      'id',
      'fullname',
      'city',
      'role_id',
      'commision',
      'commission_type',
      'statement_period',
      'statement_grace_days',
      'statement_from',
      'created_at',
    ])
    .where('id', '=', labId)
    .executeTakeFirst();
}

type LabRow = NonNullable<Awaited<ReturnType<typeof readLab>>>;

/** Reads a laboratory's orders and payments, and bills them. */
async function compute(lab: LabRow, now = new Date()) {
  const today = todayIso(now);
  const created = String(lab.created_at ?? '').slice(0, 10);
  const startsOn = lab.statement_from
    ? monthStart(String(lab.statement_from))
    : [STATEMENTS_BEGIN, created ? monthStart(created) : ''].sort().at(-1)!;
  const rate = Number(lab.commision) || 0;
  const perPiece = lab.commission_type === COMMISSION_TYPE.PER_PIECE;

  // Dated by `order_date`, which is dd-mm-yyyy text; the same gate as the
  // commission everywhere else: delivered, or money taken on it.
  const orderDay = sql<string>`date_format(str_to_date(order_date, '%d-%m-%Y'), '%Y-%m-%d')`;
  const orders = await live(db.selectFrom('orders'))
    .select(['id', 'order_no', 'status', 'paid_amount', orderDay.as('day')])
    .where('lab_id', '=', lab.id)
    .where((eb) =>
      eb.or([eb('status', '=', 'delivered'), sql<SqlBool>`coalesce(paid_amount, 0) + 0 > 0`]),
    )
    .where(sql<SqlBool>`str_to_date(order_date, '%d-%m-%Y') >= ${startsOn}`)
    .where(sql<SqlBool>`str_to_date(order_date, '%d-%m-%Y') <= ${today}`)
    .orderBy('id')
    .execute();

  const ids = orders.map((o) => Number(o.id));
  const pieceRows = ids.length
    ? await db
        .selectFrom('order_details')
        .select(({ fn }) => ['order_id', fn.sum<number>('qty').as('total')])
        .where('order_id', 'in', ids)
        .groupBy('order_id')
        .execute()
    : [];
  const piecesOf = new Map(pieceRows.map((r) => [Number(r.order_id), Number(r.total) || 0]));

  const lines: StatementLine[] = orders.map((o) => {
    const collected = Number(o.paid_amount) || 0;
    const pieces = piecesOf.get(Number(o.id)) ?? 0;
    return {
      id: Number(o.id),
      order_no: o.order_no,
      day: String(o.day),
      status: o.status,
      collected,
      pieces,
      commission: round2(perPiece ? pieces * rate : (collected * rate) / 100),
    };
  });

  const posted = async (status: number) =>
    Number(
      (
        await db
          .selectFrom('transactions')
          .select(db.fn.sum<number>('amount').as('total'))
          .where('transaction_type', '=', TRANSACTION_TYPE.COMMISSION)
          .where('send_by', '=', lab.id)
          .where('status', '=', status)
          .where(sql<SqlBool>`created_at >= ${startsOn}`)
          .executeTakeFirstOrThrow()
      ).total ?? 0,
    );
  const [paid, pending] = await Promise.all([posted(STATUS.APPROVED), posted(STATUS.PENDING)]);

  return buildStatements({
    startsOn,
    // 0 is None, not "unset": only a missing value falls back to monthly.
    months: lab.statement_period == null ? 1 : Number(lab.statement_period),
    graceDays: Number(lab.statement_grace_days ?? 15),
    today,
    lines,
    paid,
    pending,
  });
}

export type LabStatements = StatementBook & {
  lab: { id: number; fullname: string; city: string | null; rate: number; commission_type: string };
};

/** One laboratory's statements, as the panel shows them. */
export async function labStatements(labId: number, now = new Date()): Promise<LabStatements> {
  const lab = await readLab(labId);
  if (!lab || lab.role_id !== ROLE.LAB) throw notFound('Laboratory not found.');
  const { linesByKey: _lines, ...book } = await compute(lab, now);
  return {
    ...book,
    lab: {
      id: Number(lab.id),
      fullname: lab.fullname,
      city: lab.city,
      rate: Number(lab.commision) || 0,
      commission_type: lab.commission_type,
    },
  };
}

/**
 * Refuses certificate generation for a laboratory past its grace days.
 *
 * Anything that is not a laboratory — head office's own staff issue under head
 * office — is not billed, and passes.
 */
export async function assertReportsUnlocked(labId: number): Promise<void> {
  const lab = await readLab(labId);
  if (!lab || lab.role_id !== ROLE.LAB) return;
  const book = await compute(lab);
  if (book.standing !== 'locked' || !book.reminder) return;
  const owed = `₹${book.outstanding.toLocaleString('en-IN')}`;
  throw new ApiError(
    423,
    `Certificate generation is locked: the statement billed on ${book.reminder.billed_on} was due on ${book.reminder.due_on} and ${owed} is unpaid. ` +
      (book.pending > 0
        ? 'A payment is waiting on head office; this unlocks once it is approved.'
        : 'Pay it to unlock — generation resumes once head office approves the payment.'),
    'statement_overdue',
  );
}

const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates/lab-statement.ejs');

/** One billed statement, as the sheet a laboratory downloads. */
export async function statementHtml(labId: number, key: string, issuedBy: string): Promise<string> {
  const lab = await readLab(labId);
  if (!lab || lab.role_id !== ROLE.LAB) throw notFound('Laboratory not found.');
  const book = await compute(lab);
  const period = book.periods.find((p) => p.key === key);
  if (!period) throw notFound('That period has not been billed yet.');


  return ejs.renderFile(TEMPLATE, {
    lab,
    period,
    lines: book.linesByKey.get(key) ?? [],
    book,
    perPiece: lab.commission_type === COMMISSION_TYPE.PER_PIECE,
    rate: Number(lab.commision) || 0,
    issuedBy,
    letterhead: await letterheadHtml(),
  });
}

export async function statementPdf(labId: number, key: string, issuedBy: string): Promise<Buffer> {
  const html = await statementHtml(labId, key, issuedBy);
  const { renderHtmlToPdf } = await import('./pdf.service.js');
  return renderHtmlToPdf(html, { format: 'A4' });
}
