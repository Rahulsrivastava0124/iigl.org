import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { assertLabOwnership, requireLabScope, ROLE } from '../middleware/auth.js';
import {
  ledgerFor,
  sendCommission,
  validateCommissionInput,
} from '../services/commission.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const transactionRoutes = Router();
transactionRoutes.use(requireLabScope);

/** transactions.status: 0 pending, 1 approved, 2 declined. */
const STATUS = { PENDING: 0, APPROVED: 1, DECLINED: 2 } as const;

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

    res.json(paged(rows, Number(count.n), p));
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
