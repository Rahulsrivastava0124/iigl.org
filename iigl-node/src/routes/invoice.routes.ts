import { Router } from 'express';
import type { Transaction } from 'kysely';
import { db } from '../db/index.js';
import type { DB } from '../db/types.js';
import { wrap } from '../lib/async.js';
import { badRequest, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { requireLabScope } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
import { TRANSACTION_TYPE, STATUS } from '../services/commission.service.js';

/**
 * Purchase and sales invoices.
 *
 * A plain hand-kept ledger of what the account bought and sold — the Invoice
 * screen in the panel. Each row is one line, and a purchase also writes the
 * money leaving: an approved `expense` in `transactions`, `send_by` the account
 * itself, which is a debit on its wallet. A sale is recorded but does not touch
 * the wallet here.
 *
 * Scoped to the caller's own account: a laboratory keeps its books, head office
 * keeps its own. Nothing crosses between accounts.
 */

export const invoiceRoutes = Router();
invoiceRoutes.use(requireLabScope);

type Kind = 'purchases' | 'sales';

interface Input {
  party_name: string;
  product_name: string;
  gst_no: string | null;
  invoice_date: string;
  quantity: number;
  rate: number;
  payment_method: string | null;
  /** What was actually paid; null when the field was left off (settled in full). */
  paid_amount: number | null;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Keep a purchase's wallet debit equal to what it has paid.
 *
 * One `expense` transaction stands for the money a purchase took out. Paying
 * more, editing the bill or clearing it all moves that one row rather than
 * stacking new ones, so the wallet always shows exactly what the purchase has
 * cost — and deleting the purchase has one row to reverse. A purchase paid
 * nothing carries no transaction at all.
 */
async function syncWalletTxn(
  trx: Transaction<DB>,
  userId: number,
  existingId: number | null,
  paid: number,
  meta: { remark: string; payMode: string | null; date: Date; now: Date },
): Promise<number | null> {
  if (paid > 0) {
    if (existingId) {
      await trx
        .updateTable('transactions')
        .set({ amount: String(paid), pay_mode: meta.payMode ?? 'Cash', remark: meta.remark, updated_at: meta.now })
        .where('id', '=', existingId)
        .where('send_by', '=', userId)
        .execute();
      return existingId;
    }
    const txn = await trx
      .insertInto('transactions')
      .values({
        amount: String(paid),
        pay_mode: meta.payMode ?? 'Cash',
        transaction_no: null,
        transaction_type: TRANSACTION_TYPE.EXPENSE,
        remark: meta.remark,
        send_by: userId,
        received_by: 0,
        status: STATUS.APPROVED,
        seen_by_sender: 1,
        seen_by_receiver: 0,
        created_at: meta.date,
        updated_at: meta.now,
      })
      .executeTakeFirst();
    return Number(txn.insertId);
  }
  if (existingId) {
    await trx.deleteFrom('transactions').where('id', '=', existingId).where('send_by', '=', userId).execute();
  }
  return null;
}

/**
 * The laboratory a sale was made to, by the name on it.
 *
 * The panel picks the laboratory from a list and sends its `fullname`, so the
 * name is exact. Stored as an id all the same: a name cannot be joined on, and
 * it stops being true the day somebody is renamed.
 *
 * Null for a sale to anybody who is not a laboratory — nothing more happens
 * with it than before.
 */
async function buyerLabId(partyName: string): Promise<number | null> {
  const lab = await db
    .selectFrom('users')
    .select('id')
    .where('fullname', '=', partyName)
    .where('role_id', '=', 2)
    .executeTakeFirst();
  return lab ? Number(lab.id) : null;
}

/** Read and check the body common to a purchase and a sale. */
function validate(body: Record<string, unknown>): Input {
  const party_name = String(body.party_name ?? '').trim();
  const product_name = String(body.product_name ?? '').trim();
  const invoice_date = String(body.invoice_date ?? '').trim();
  if (!party_name) throw badRequest('A name is required.');
  if (!product_name) throw badRequest('A product name is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoice_date)) throw badRequest('A valid date (YYYY-MM-DD) is required.');
  const quantity = Number(body.quantity);
  const rate = Number(body.rate);
  if (!Number.isFinite(quantity) || quantity < 0) throw badRequest('Quantity must be a number.');
  if (!Number.isFinite(rate) || rate < 0) throw badRequest('Amount must be a number.');
  const payment_method = body.payment_method ? String(body.payment_method).trim() : null;
  const gst_no = body.gst_no ? String(body.gst_no).trim().toUpperCase() : null;
  const paidRaw = body.paid_amount;
  const paid_amount =
    paidRaw === undefined || paidRaw === null || paidRaw === '' ? null : Number(paidRaw);
  if (paid_amount !== null && (!Number.isFinite(paid_amount) || paid_amount < 0)) {
    throw badRequest('Paid amount must be a number.');
  }
  return { party_name, product_name, gst_no, invoice_date, quantity, rate, payment_method, paid_amount };
}

/** One of the caller's own rows, or 404. */
async function own(kind: Kind, id: number, userId: number) {
  const row = await db
    .selectFrom(kind)
    .selectAll()
    .where('id', '=', id)
    .where('lab_id', '=', userId)
    .executeTakeFirst();
  if (!row) throw notFound('Invoice not found.');
  return row;
}

/** The sales list, newest first, filtered by customer (party) and product
 *  where either is given. Purchases have their own, below. */
function list(kind: Kind) {
  return wrap(async (req, res) => {
    const p = readPage(req);
    let base = db.selectFrom(kind).where('lab_id', '=', req.user.id);
    const supplier = String(req.query.supplier ?? '').trim();
    const product = String(req.query.product ?? '').trim();
    if (supplier) base = base.where('party_name', 'like', `%${supplier}%`);
    if (product) base = base.where('product_name', 'like', `%${product}%`);
    const rows = await base
      .selectAll()
      .orderBy('id', 'desc')
      .limit(p.limit)
      .offset(p.offset)
      .execute();
    const [{ total }] = await base.select((eb) => eb.fn.countAll<number>().as('total')).execute();
    res.json(paged(rows, Number(total), p));
  });
}

/**
 * A laboratory's purchases: its own, and what head office sold it.
 *
 * A sale is head office's row, in head office's books — and it is the same
 * event as the laboratory buying the thing. Kept apart, a laboratory could not
 * see what it had been billed for until somebody typed the bill in a second
 * time, which is two records of one purchase and two chances to be wrong.
 *
 * So head office's sales to this laboratory are listed here as purchases from
 * head office, marked `source: 'sale'`. They are read-only on this side: the
 * row belongs to the seller, and it is theirs to correct or to be paid.
 *
 * ponytail: the two lists are merged and paged in memory. These are hand-kept
 * ledgers of tens to hundreds of lines; past a few thousand this wants to be
 * one UNION query paged in SQL.
 */
function purchaseList() {
  return wrap(async (req, res) => {
    const p = readPage(req);
    const supplier = String(req.query.supplier ?? '').trim().toLowerCase();
    const product = String(req.query.product ?? '').trim().toLowerCase();

    const [mine, bought] = await Promise.all([
      db.selectFrom('purchases').selectAll().where('lab_id', '=', req.user.id).execute(),
      db
        .selectFrom('sales')
        .leftJoin('users as seller', 'seller.id', 'sales.lab_id')
        .selectAll('sales')
        .select('seller.fullname as seller_name')
        .where('sales.buyer_lab_id', '=', req.user.id)
        .execute(),
    ]);

    const rows = [
      ...mine.map((r) => ({ ...r, source: 'purchase' as const })),
      // The seller is the supplier on this side of the same line.
      ...bought.map(({ seller_name, buyer_lab_id: _buyer, ...r }) => ({
        ...r,
        party_name: seller_name ?? 'Head office',
        source: 'sale' as const,
      })),
    ]
      .filter((r) => !supplier || String(r.party_name).toLowerCase().includes(supplier))
      .filter((r) => !product || String(r.product_name).toLowerCase().includes(product))
      .sort((a, b) => {
        const day = String(b.invoice_date).slice(0, 10).localeCompare(String(a.invoice_date).slice(0, 10));
        return day !== 0 ? day : Number(b.id) - Number(a.id);
      });

    res.json(paged(rows.slice(p.offset, p.offset + p.limit), rows.length, p));
  });
}

invoiceRoutes.get('/purchases', purchaseList());
invoiceRoutes.get('/sales', list('sales'));

/*
  A purchase: the row, and the money leaving the account's wallet.

  Both in one transaction — a purchase on the books whose expense never wrote
  would read as money still in the wallet, and an expense with no purchase
  behind it is a debit nobody can explain.
*/
invoiceRoutes.post(
  '/purchases',
  wrap(async (req, res) => {
    const input = validate(req.body ?? {});
    const amount = round2(input.quantity * input.rate);
    // Paid in full unless a smaller figure was entered; never more than the bill.
    const paid = round2(Math.min(input.paid_amount ?? amount, amount));
    const now = new Date();
    const date = new Date(`${input.invoice_date}T00:00:00`);

    const remark = `Purchase — ${input.product_name} from ${input.party_name}`;
    const id = await db.transaction().execute(async (trx) => {
      // The wallet moves by what was paid. An unpaid bill takes nothing out.
      const transactionId = await syncWalletTxn(trx, req.user.id, null, paid, {
        remark,
        payMode: input.payment_method,
        date,
        now,
      });

      const purchase = await trx
        .insertInto('purchases')
        .values({
          lab_id: req.user.id,
          party_name: input.party_name,
          product_name: input.product_name,
          gst_no: input.gst_no,
          invoice_date: input.invoice_date,
          quantity: String(input.quantity),
          rate: String(input.rate),
          amount: String(amount),
          paid_amount: String(paid),
          payment_method: input.payment_method,
          transaction_id: transactionId,
          created_by: req.user.id,
          created_at: now,
          updated_at: now,
        })
        .executeTakeFirst();

      return Number(purchase.insertId);
    });

    const row = await db.selectFrom('purchases').selectAll().where('id', '=', id).executeTakeFirst();
    res.status(201).json({ data: row });
  }),
);

/** A sale: the row alone. It does not move the wallet here. */
invoiceRoutes.post(
  '/sales',
  wrap(async (req, res) => {
    const input = validate(req.body ?? {});
    const amount = round2(input.quantity * input.rate);
    const paid = round2(Math.min(input.paid_amount ?? amount, amount));
    const now = new Date();

    const sale = await db
      .insertInto('sales')
      .values({
        lab_id: req.user.id,
        buyer_lab_id: await buyerLabId(input.party_name),
        party_name: input.party_name,
        product_name: input.product_name,
        gst_no: input.gst_no,
        invoice_date: input.invoice_date,
        quantity: String(input.quantity),
        rate: String(input.rate),
        amount: String(amount),
        paid_amount: String(paid),
        payment_method: input.payment_method,
        transaction_id: null,
        created_by: req.user.id,
        created_at: now,
        updated_at: now,
      })
      .executeTakeFirst();

    const row = await db.selectFrom('sales').selectAll().where('id', '=', Number(sale.insertId)).executeTakeFirst();
    res.status(201).json({ data: row });
  }),
);

/*
  Pay down an invoice's due.

  A further payment against what is still owed raises `paid_amount`. A purchase
  moves its one wallet expense up to match; a sale touches no wallet.
*/
function pay(kind: Kind) {
  return wrap(async (req, res) => {
    const row = await own(kind, Number(req.params.id), req.user.id);
    const due = round2(Number(row.amount) - Number(row.paid_amount));
    if (due <= 0) throw badRequest('Nothing is due on this invoice.');
    const amt = Number(req.body?.amount);
    if (!Number.isFinite(amt) || amt <= 0) throw badRequest('Enter an amount to pay.');
    const newPaid = round2(Number(row.paid_amount) + Math.min(amt, due));
    const now = new Date();

    await db.transaction().execute(async (trx) => {
      let txnId = row.transaction_id;
      if (kind === 'purchases') {
        txnId = await syncWalletTxn(trx, req.user.id, row.transaction_id, newPaid, {
          remark: `Purchase — ${row.product_name} from ${row.party_name}`,
          payMode: row.payment_method,
          date: new Date(`${String(row.invoice_date).slice(0, 10)}T00:00:00`),
          now,
        });
      }
      await trx
        .updateTable(kind)
        .set({ paid_amount: String(newPaid), transaction_id: txnId, updated_at: now })
        .where('id', '=', Number(row.id))
        .execute();
    });

    const updated = await db.selectFrom(kind).selectAll().where('id', '=', Number(row.id)).executeTakeFirst();
    res.json({ data: updated });
  });
}

/*
  Edit an invoice.

  The line is rewritten. A purchase's wallet expense is re-fitted to the new
  figures — paid never more than the new total, the one transaction moved to
  match; a sale is just updated.
*/
function edit(kind: Kind) {
  return wrap(async (req, res) => {
    const row = await own(kind, Number(req.params.id), req.user.id);
    const input = validate(req.body ?? {});
    const amount = round2(input.quantity * input.rate);
    const basePaid = input.paid_amount ?? Number(row.paid_amount);
    const paid = round2(Math.min(Math.max(basePaid, 0), amount));
    const now = new Date();
    const date = new Date(`${input.invoice_date}T00:00:00`);

    await db.transaction().execute(async (trx) => {
      let txnId = row.transaction_id;
      if (kind === 'purchases') {
        txnId = await syncWalletTxn(trx, req.user.id, row.transaction_id, paid, {
          remark: `Purchase — ${input.product_name} from ${input.party_name}`,
          payMode: input.payment_method,
          date,
          now,
        });
      }
      await trx
        .updateTable(kind)
        .set({
          // A sale re-pointed at another laboratory follows the name.
          ...(kind === 'sales' ? { buyer_lab_id: await buyerLabId(input.party_name) } : {}),
          party_name: input.party_name,
          product_name: input.product_name,
          gst_no: input.gst_no,
          invoice_date: input.invoice_date,
          quantity: String(input.quantity),
          rate: String(input.rate),
          amount: String(amount),
          paid_amount: String(paid),
          payment_method: input.payment_method,
          transaction_id: txnId,
          updated_at: now,
        })
        .where('id', '=', Number(row.id))
        .execute();
    });

    const updated = await db.selectFrom(kind).selectAll().where('id', '=', Number(row.id)).executeTakeFirst();
    res.json({ data: updated });
  });
}

invoiceRoutes.post('/purchases/:id/pay', numericId, pay('purchases'));
invoiceRoutes.post('/sales/:id/pay', numericId, pay('sales'));
invoiceRoutes.put('/purchases/:id', numericId, edit('purchases'));
invoiceRoutes.put('/sales/:id', numericId, edit('sales'));

/*
  Removing an invoice removes what it wrote.

  A purchase takes its wallet expense with it, so deleting the line the money
  came off puts the money back. Only the caller's own rows, and only the
  transaction this purchase created.
*/
function remove(kind: Kind) {
  return wrap(async (req, res) => {
    const row = await db
      .selectFrom(kind)
      .selectAll()
      .where('id', '=', Number(req.params.id))
      .where('lab_id', '=', req.user.id)
      .executeTakeFirst();
    if (!row) throw notFound('Invoice not found.');

    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom(kind).where('id', '=', Number(row.id)).execute();
      if (row.transaction_id) {
        await trx
          .deleteFrom('transactions')
          .where('id', '=', Number(row.transaction_id))
          .where('send_by', '=', req.user.id)
          .execute();
      }
    });

    res.json({ data: { id: Number(row.id) } });
  });
}

invoiceRoutes.delete('/purchases/:id', numericId, remove('purchases'));
invoiceRoutes.delete('/sales/:id', numericId, remove('sales'));
