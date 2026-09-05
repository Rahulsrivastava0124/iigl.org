import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { assertLabOwnership, requireLabScope, ROLE } from '../middleware/auth.js';
import {
  accruedByLab,
  commissionEarnings,
  COMMISSION_TYPE,
  ledgerFor,
  sendCommission,
  TRANSACTION_TYPE,
  validateCommissionInput,
} from '../services/commission.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const transactionRoutes = Router();
transactionRoutes.use(requireLabScope);

/** transactions.status: 0 pending, 1 approved, 2 declined. */
const STATUS = { PENDING: 0, APPROVED: 1, DECLINED: 2 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

transactionRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req);
    const direction = String(req.query.direction ?? 'all');

    let q = db.selectFrom('transactions').selectAll();
    let c = db.selectFrom('transactions').select(db.fn.countAll().as('n'));

    if (req.user.roleId !== ROLE.SUPER) {
      const me = req.user.id;
      const mine = (eb: any) =>
        direction === 'sent'
          ? eb('send_by', '=', me)
          : direction === 'received'
            ? eb('received_by', '=', me)
            : eb.or([eb('send_by', '=', me), eb('received_by', '=', me)]);
      q = q.where(mine);
      c = c.where(mine);
    }

    // `transaction_type` is free text in the schema; the values in use are
    // 'commision' (the Laravel spelling) and the order payment kinds. The
    // wallet screen asks for one of them by name.
    if (req.query.type) {
      const type = String(req.query.type);
      q = q.where('transaction_type', '=', type);
      c = c.where('transaction_type', '=', type);
    }

    if (req.query.status != null) {
      const s = Number(req.query.status);
      q = q.where('status', '=', s);
      c = c.where('status', '=', s);
    }

    const search = readSearch(req, ['transaction_no', 'remark', 'pay_mode', 'transaction_type']);
    if (search) {
      q = q.where(search);
      c = c.where(search);
    }

    const [rows, count] = await Promise.all([
      q.orderBy('id', 'desc').limit(p.limit).offset(p.offset).execute(),
      c.executeTakeFirstOrThrow(),
    ]);

    // Who sent and who received, by name. The columns hold ids, and a ledger
    // that prints `#4` is a ledger somebody has to go and look things up in.
    // Resolved in one query over the ids on the page rather than a join, so the
    // filters above stay as they are.
    const ids = [...new Set(rows.flatMap((r) => [Number(r.send_by), Number(r.received_by)]))].filter(
      (id) => id > 0,
    );
    const people = ids.length
      ? await db.selectFrom('users').select(['id', 'fullname']).where('id', 'in', ids).execute()
      : [];
    const nameOf = new Map(people.map((u) => [Number(u.id), u.fullname]));

    res.json(
      paged(
        rows.map((r) => ({
          ...r,
          // 0 is the sentinel for a walk-in customer with no account.
          send_by_name: nameOf.get(Number(r.send_by)) ?? null,
          received_by_name: nameOf.get(Number(r.received_by)) ?? null,
        })),
        Number(count.n),
        p,
      ),
    );
  }),
);

/**
 * Send money upward: a lab remits to the administrator, staff remit to their
 * lab. Lands as pending until the receiver approves it.
 */
transactionRoutes.post(
  '/',
  wrap(async (req, res) => {
    const { amount, pay_mode, transaction_no, transaction_type, remark, attachment } = req.body ?? {};
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) throw badRequest('Enter an amount greater than zero.');
    if (!pay_mode) throw badRequest('Select a payment mode.');

    const receivedBy = req.user.roleId === ROLE.LAB ? ROLE.SUPER : req.user.labId;
    if (receivedBy === null) throw badRequest('Your account is not linked to a laboratory.');

    const result = await db
      .insertInto('transactions')
      .values({
        amount: String(value),
        pay_mode: String(pay_mode),
        transaction_no: transaction_no ? String(transaction_no) : null,
        transaction_type: transaction_type ? String(transaction_type) : null,
        remark: remark ? String(remark) : null,
        attachment: attachment ? String(attachment) : null,
        send_by: req.user.id,
        received_by: receivedBy,
        status: STATUS.PENDING,
        seen_by_sender: 1,
        seen_by_receiver: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

/**
 * Amend a transaction.
 *
 * A laboratory's own act, and only its own: it is the account that writes these
 * rows — a remittance to head office, a commission payment — and mistyping a
 * cheque number is what this is for. Head office does not edit them, because
 * head office is the receiver on every one of them, and a receiver rewriting
 * what it was sent before deciding on it is not an amendment.
 *
 * What may change depends on what the row has already done:
 *
 *   pay_mode, transaction_no, remark  always. They describe the payment; they
 *                                     are not the payment.
 *   amount                            only while the row is still pending and
 *                                     stands on its own. Once head office has
 *                                     approved it the figure is in a balance
 *                                     both sides have seen, and an order
 *                                     collection carries its figure in the
 *                                     order's paid and dues columns as well —
 *                                     rewriting one of those here would leave
 *                                     the order saying something different.
 *                                     Both cases are refused with the reason.
 *
 * Editing a row that head office has already decided sends nothing back for
 * decision: the status is its own endpoint, and a laboratory does not move its
 * own payment back into the queue.
 */
transactionRoutes.patch(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    if (req.user.roleId !== ROLE.LAB) {
      throw forbidden('Only a laboratory account can amend a transaction.');
    }

    const row = await db
      .selectFrom('transactions')
      .select(['id', 'send_by', 'status', 'order_id', 'amount'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('Transaction not found.');
    if (Number(row.send_by) !== req.user.id) {
      throw forbidden('You can only amend a transaction you sent.');
    }

    const b = req.body ?? {};
    const patch: Record<string, unknown> = { updated_at: new Date() };

    if (b.amount !== undefined && b.amount !== null && b.amount !== '') {
      const value = Number(b.amount);
      if (!Number.isFinite(value) || value <= 0) {
        throw badRequest('Enter an amount greater than zero.');
      }
      if (row.order_id !== null) {
        throw badRequest(
          'This is a collection against an order, and the order carries the same figure. Change it on the order instead.',
        );
      }
      if (Number(row.status) !== STATUS.PENDING) {
        throw badRequest('This transaction has been decided. Its amount can no longer be changed.');
      }
      patch.amount = String(value);
    }

    if (b.pay_mode !== undefined) {
      if (!b.pay_mode) throw badRequest('Select a payment mode.');
      patch.pay_mode = String(b.pay_mode);
    }
    if (b.transaction_no !== undefined) {
      patch.transaction_no = b.transaction_no ? String(b.transaction_no) : null;
    }
    if (b.remark !== undefined) patch.remark = b.remark ? String(b.remark) : null;

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to change.');

    // The receiver is shown it again: what it is being asked to approve has
    // moved, and a row marked seen would otherwise change under them silently.
    if (Number(row.status) === STATUS.PENDING) patch.seen_by_receiver = 0;

    await db
      .updateTable('transactions')
      .set(patch as never)
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ ok: true });
  }),
);

/**
 * Approve or decline. Only the receiver may decide — the Laravel version lets
 * anyone change any transaction status over a GET request.
 */
transactionRoutes.post(
  '/:id/status',
  numericId,
  wrap(async (req, res) => {
    const status = Number(req.body?.status);
    if (![STATUS.APPROVED, STATUS.DECLINED].includes(status as 1 | 2)) {
      throw badRequest('Status must be 1 (approve) or 2 (decline).');
    }

    const row = await db
      .selectFrom('transactions')
      .select(['id', 'received_by', 'status'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('Transaction not found.');

    if (req.user.roleId !== ROLE.SUPER && Number(row.received_by) !== req.user.id) {
      throw forbidden('Only the receiver can approve or decline this transaction.');
    }
    if (Number(row.status) !== STATUS.PENDING) {
      throw badRequest('This transaction has already been decided.');
    }

    await db
      .updateTable('transactions')
      .set({ status, seen_by_sender: 0, updated_at: new Date() })
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ ok: true });
  }),
);

/**
 * Record a dues collection against an order. Writes the transaction and moves
 * the order balance in one transaction; the PHP does both unguarded, which is
 * how paid and dues amounts drift apart.
 */
transactionRoutes.post(
  '/dues/:orderId',
  numericParams('orderId'),
  wrap(async (req, res) => {
    const { amount, pay_mode, transaction_no, remark } = req.body ?? {};
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) throw badRequest('Enter an amount greater than zero.');

    await db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .where('deleted_at', 'is', null)
        .select(['id', 'lab_id', 'paid_amount', 'dues_amount'])
        .where('id', '=', Number(req.params.orderId))
        .executeTakeFirst();
      if (!order) throw notFound('Order not found.');
      assertLabOwnership(req.user, Number(order.lab_id));

      const dues = Number(order.dues_amount ?? 0);
      if (value > dues) throw badRequest(`Collection exceeds the outstanding balance of ${dues}.`);

      await trx
        .insertInto('transactions')
        .values({
          amount: String(value),
          pay_mode: pay_mode ? String(pay_mode) : 'cash',
          transaction_no: transaction_no ? String(transaction_no) : null,
          remark: remark ? String(remark) : null,
          transaction_type: 'collected_by_order',
          order_id: Number(order.id),
          // Collected from a walk-in customer, who has no user row. The PHP omits
          // this column and MySQL stores 0; recorded explicitly here.
          send_by: 0,
          received_by: req.user.id,
          status: STATUS.APPROVED,
          seen_by_sender: 1,
          seen_by_receiver: 1,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();

      await trx
        .updateTable('orders')
        .set({
          paid_amount: String(Number(order.paid_amount ?? 0) + value),
          dues_amount: String(dues - value),
          updated_at: new Date(),
        })
        .where('id', '=', Number(order.id))
        .execute();
    });

    res.json({ ok: true });
  }),
);

/** Running balance for the signed-in user: approved in, approved out. */
transactionRoutes.get(
  '/wallet',
  wrap(async (req, res) => {
    const [inbound, outbound] = await Promise.all([
      db
        .selectFrom('transactions')
        .select(db.fn.sum<number>('amount').as('total'))
        .where('received_by', '=', req.user.id)
        .where('status', '=', STATUS.APPROVED)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('transactions')
        .select(db.fn.sum<number>('amount').as('total'))
        .where('send_by', '=', req.user.id)
        .where('status', '=', STATUS.APPROVED)
        .executeTakeFirstOrThrow(),
    ]);

    const received = Number(inbound.total ?? 0);
    const sent = Number(outbound.total ?? 0);
    res.json({ data: { received, sent, balance: received - sent } });
  }),
);

/**
 * Pay commission to the administrator. The amount is derived from the
 * laboratory's own configured rate, not taken from the request — the Laravel
 * version accepts both the base and the amount from the browser.
 */
transactionRoutes.post(
  '/commission',
  wrap(async (req, res) => {
    const result = await sendCommission(req.user, validateCommissionInput(req.body));
    res.status(201).json({ data: result });
  }),
);

/**
 * What commission stands at: earned, paid, and the difference.
 *
 * The same three figures the dashboard reports, given on their own so the
 * commission screen does not have to fetch a whole dashboard for them. Read
 * from the same helper the dashboard and the laboratory list read, because
 * four screens quoting a franchise a different figure is how this went wrong
 * before.
 *
 * A laboratory sees its own; head office sees every laboratory summed. The
 * rate and its reading come back too: the Pay dialog needs them to say what
 * the amount will be before it is sent, and a per-piece laboratory is asked
 * for pieces rather than for a share of its takings.
 */
transactionRoutes.get(
  '/commission/summary',
  wrap(async (req, res) => {
    const isAdmin = req.user.roleId === ROLE.SUPER;
    const labId = req.user.labId;

    const byLab = await accruedByLab(isAdmin ? undefined : labId ?? undefined);
    const accrued = round2([...byLab.values()].reduce((total, n) => total + n, 0));

    /* Commission rows already posted, by where they stand. The administrator
       receives on every one and a laboratory sends, so the role decides which
       side to read rather than both being summed together. */
    const posted = async (status: number) => {
      let q = db
        .selectFrom('transactions')
        .select(db.fn.sum<number>('amount').as('total'))
        .where('transaction_type', '=', TRANSACTION_TYPE.COMMISSION)
        .where('status', '=', status);
      if (!isAdmin) q = q.where('send_by', '=', req.user.id);
      return round2(Number((await q.executeTakeFirstOrThrow()).total ?? 0));
    };

    const [paid, pending, me] = await Promise.all([
      posted(STATUS.APPROVED),
      posted(STATUS.PENDING),
      isAdmin || labId === null
        ? Promise.resolve(undefined)
        : db
            .selectFrom('users')
            .select(['commision', 'commission_type'])
            .where('id', '=', labId)
            .executeTakeFirst(),
    ]);

    res.json({
      data: {
        accrued,
        paid,
        // Awaiting the administrator's decision: sent, but not yet money that
        // has moved, so it is neither paid nor quietly dropped from the due.
        pending,
        // Never negative: an overpayment is a wallet balance, not a debt.
        due: round2(Math.max(0, accrued - paid)),
        rate: me ? Number(me.commision ?? 0) : null,
        commission_type: me?.commission_type ?? null,
        per_piece: me?.commission_type === COMMISSION_TYPE.PER_PIECE,
      },
    });
  }),
);

/**
 * What earned the commission, order by order.
 *
 * The remittance list answers "what have I sent"; this answers "what is the
 * figure made of", which is the question a laboratory looking at a due it has
 * never paid is actually asking. Newest order first, and scoped the way every
 * other list here is: a laboratory sees its own, head office sees them all.
 */
transactionRoutes.get(
  '/commission/earnings',
  wrap(async (req, res) => {
    const isAdmin = req.user.roleId === ROLE.SUPER;
    const p = readPage(req, 100, 500);
    const { entries, total } = await commissionEarnings(
      isAdmin ? undefined : (req.user.labId ?? undefined),
      p.limit,
      p.offset,
    );
    res.json(paged(entries, total, p));
  }),
);

/** Running account: credits, debits and the balance after each entry. */
transactionRoutes.get(
  '/ledger',
  wrap(async (req, res) => {
    const target =
      req.user.roleId === ROLE.SUPER && req.query.user_id
        ? Number(req.query.user_id)
        : req.user.id;

    const p = readPage(req, 100, 500);
    res.json({ data: await ledgerFor(target, p.limit, p.offset) });
  }),
);
