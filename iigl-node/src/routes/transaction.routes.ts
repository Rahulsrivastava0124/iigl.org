import { Router } from 'express';
import { db } from '../db/index.js';
import { refreshOrderMoney } from '../services/pricing.service.js';
import { accountStatementHtml, accountStatementPdf } from '../services/document.service.js';
import { wrap } from '../lib/async.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { assertEmploys, assertLabOwnership, requireLabScope, ROLE } from '../middleware/auth.js';
import { accruedByLab, commissionEarnings, COMMISSION_TYPE, expenseWallets, ledgerFor, sendCommission, TRANSACTION_TYPE, validateCommissionInput, receivedIntoWallet, type LedgerScope } from '../services/commission.service.js';
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

    /*
      Whose history this is.

      This endpoint answers "my transactions", and it answers it for everybody
      — head office included. It used to leave head office unfiltered, on the
      reasoning that an administrator may see everything, and the result was
      that head office's Transaction History listed a laboratory's own money:
      the collections its staff took at the counter and the wallet transfers
      between them, neither of which head office is a party to.

      Seeing everything is a different question, asked deliberately:

        scope=all        every transaction in the system
        user_id=26       one account's, as `/ledger` already takes it

      Both are head office's alone. For anybody else they are ignored rather
      than refused: a laboratory asking for another account's history is asking
      for its own.
    */
    const isSuper = req.user.roleId === ROLE.SUPER;
    const wantsAll = isSuper && String(req.query.scope ?? '') === 'all';
    const target = isSuper && req.query.user_id ? Number(req.query.user_id) : req.user.id;

    if (!wantsAll) {
      const mine = (eb: any) =>
        direction === 'sent'
          ? eb('send_by', '=', target)
          : direction === 'received'
            ? eb('received_by', '=', target)
            : eb.or([eb('send_by', '=', target), eb('received_by', '=', target)]);
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

    /*
      The customer, on money taken at the counter.

      `send_by` is 0 there — a walk-in has no account, and 0 is the sentinel for
      "nobody" — so no user row can name them. The order can: it carries the
      name written on it when the order was taken, and the transaction names the
      order. The same rule the wallet ledger reads, so the two screens cannot
      name the same payment differently.
    */
    const orderIds = [
      ...new Set(rows.filter((r) => Number(r.send_by) === 0 && r.order_id).map((r) => Number(r.order_id))),
    ];
    const orders = orderIds.length
      ? await db.selectFrom('orders').select(['id', 'customer_name']).where('id', 'in', orderIds).execute()
      : [];
    const customerOf = new Map(
      orders
        .filter((o) => o.customer_name && String(o.customer_name).trim())
        .map((o) => [Number(o.id), String(o.customer_name).trim()]),
    );

    res.json(
      paged(
        rows.map((r) => ({
          ...r,
          // 0 is the sentinel for a walk-in customer with no account, named
          // from their order where there is one.
          send_by_name:
            nameOf.get(Number(r.send_by)) ??
            (r.order_id ? (customerOf.get(Number(r.order_id)) ?? null) : null),
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
    const { amount, pay_mode, transaction_no, remark, attachment } = req.body ?? {};
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
        /*
          Always a wallet transfer. It used to take the type from the body, so a
          transfer sent without one was stored untyped — and the dashboard only
          subtracts approved `wallet_transfer` rows from what somebody holds,
          so that money never came off their wallet. Taking it from the body also
          let a caller label a transfer as a commission payment or an expense.
          Those have their own routes.
        */
        transaction_type: TRANSACTION_TYPE.WALLET_TRANSFER,
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
 * Send an employee a float to spend on the laboratory's behalf.
 *
 * The one transfer that goes **down**. Every other transfer here goes up — staff
 * to their laboratory, a laboratory to head office — which is why there was no way
 * to fund an expense wallet at all until this existed.
 *
 * **Approved at once.** Every other transfer waits for its receiver, because the
 * receiver is the one taking custody of money somebody else says they sent. Here
 * the sender is the employee's own employer, the account that approves
 * everything that employee does: there is nobody above it to ask, and an
 * employee cannot usefully refuse money handed to them. A pending float would be
 * a wallet that reads zero while the cash is already in their hand.
 *
 * Only to one's own working employee. Head office may send to anyone.
 */
transactionRoutes.post(
  '/float',
  wrap(async (req, res) => {
    if (req.user.roleId !== ROLE.SUPER && req.user.roleId !== ROLE.LAB) {
      throw forbidden('A float is sent by a laboratory or head office, to their staff.');
    }
    const { user_id, amount, pay_mode, transaction_no, remark } = req.body ?? {};

    const employee = Number(user_id);
    if (!Number.isInteger(employee) || employee <= 0) throw badRequest('Choose the employee to send it to.');
    if (employee === req.user.id) throw badRequest('A float is sent to somebody else.');

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) throw badRequest('Enter an amount greater than zero.');
    if (!pay_mode) throw badRequest('Select a payment mode.');

    await assertEmploys(req.user, employee);

    const now = new Date();
    const result = await db
      .insertInto('transactions')
      .values({
        amount: String(value),
        pay_mode: String(pay_mode),
        transaction_no: transaction_no ? String(transaction_no) : null,
        transaction_type: TRANSACTION_TYPE.WALLET_TRANSFER,
        remark: remark ? String(remark) : 'Expense float',
        attachment: null,
        send_by: req.user.id,
        received_by: employee,
        status: STATUS.APPROVED,
        seen_by_sender: 1,
        seen_by_receiver: 0,
        created_at: now,
        updated_at: now,
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

/**
 * The signed-in employee's expense wallet: floats received, less what was spent.
 *
 * Its own endpoint rather than a field on the ledger, because the wallet page
 * shows it on both tabs — including the collection tab, whose ledger response
 * is scoped to the other wallet and has no float in it to total.
 */
transactionRoutes.get(
  '/expense-wallet',
  wrap(async (req, res) => {
    const wallets = await expenseWallets([req.user.id]);
    res.json({ data: wallets.get(req.user.id) });
  }),
);

/**
 * Record an expense: money an employee spent out of what they hold.
 *
 * **Approved as it is recorded** — no approval step, whoever records it.
 *
 * A staff member's used to wait for the employer, when an expense came out of
 * the same pot as the customers' money and an employee writing that off unseen
 * was the risk. It now comes out of the expense float only, which is money the
 * employer chose to hand over for exactly this, so the check is the float
 * itself: the employer sees every expense against it and a negative balance on
 * the staff list. That employer is stored as `received_by` — it names whose
 * float this is, and every balance already leaves these rows out of its credit.
 *
 * A laboratory and head office spend their own money. There is nobody above
 * them to approve it and nobody receiving it, so the row carries no receiver at
 * all — `received_by` 0, the same "nobody" the counter collections use for
 * their sender — and it simply leaves the wallet it was spent from.
 *
 * No ceiling at the wallet balance. Somebody who paid a courier out of their own
 * pocket is owed it, and refusing the entry would push that off the books rather
 * than onto them. The float goes negative instead.
 */
transactionRoutes.post(
  '/expense',
  wrap(async (req, res) => {
    // Their own money, with no employer behind it.
    const ownMoney = req.user.roleId === ROLE.SUPER || req.user.roleId === ROLE.LAB;

    const value = Number(req.body?.amount);
    if (!Number.isFinite(value) || value <= 0) throw badRequest('Enter an amount greater than zero.');

    const remark = String(req.body?.remark ?? '').trim();
    if (!remark) throw badRequest('Say what the money was spent on.');
    if (remark.length > 255) throw badRequest('Keep the description under 255 characters.');

    if (!ownMoney && !req.user.labId) {
      throw badRequest('Your account is not linked to an employer, so there is no float to spend from.');
    }
    const approver = ownMoney ? 0 : Number(req.user.labId);

    const optional = (v: unknown) => {
      const t = String(v ?? '').trim();
      return t === '' ? null : t;
    };

    const result = await db
      .insertInto('transactions')
      .values({
        amount: String(value),
        pay_mode: String(req.body?.pay_mode || 'cash'),
        transaction_no: optional(req.body?.transaction_no),
        transaction_type: TRANSACTION_TYPE.EXPENSE,
        remark,
        // A photograph of the bill, where there is one.
        attachment: optional(req.body?.attachment),
        send_by: req.user.id,
        received_by: approver,
        status: STATUS.APPROVED,
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
        .select(['id', 'lab_id', 'dues_amount'])
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

      // Paid and due re-read from the bill, which now counts this collection,
      // rather than added to the stored figures: a stored figure that was stale
      // would stay stale by exactly the same amount.
      await refreshOrderMoney(Number(order.id), trx);
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
        // An expense addressed to me is one I approve, and a salary addressed
        // to me is my own pay: neither is money this wallet received.
        .where(receivedIntoWallet)
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
    const { target, scope, from, to, status, q, mode } = readLedgerQuery(req);
    const p = readPage(req, 100, 500);
    res.json({
      data: await ledgerFor(target, p.limit, p.offset, scope, { from, to }, { status, q, mode }),
    });
  }),
);

/**
 * The same ledger, over the same wallet and period, as a statement to download.
 *
 * Every row in the period, not a page: the totals on a statement have to be the
 * sum of the rows printed under them. A PDF inline, so it opens in the browser
 * and prints from there; `?format=html` returns the markup it is rendered from.
 */
transactionRoutes.get(
  '/ledger/statement',
  wrap(async (req, res) => {
    // The same filters the list was given, so the sheet is the list on screen.
    const { target, scope, from, to, status, q, mode } = readLedgerQuery(req);
    const issuedBy = req.user.fullname ?? 'IIGL';
    const filter = { status, q, mode };

    if (req.query.format === 'html') {
      res.type('html').send(await accountStatementHtml(target, scope, { from, to }, issuedBy, filter));
      return;
    }

    const pdf = await accountStatementPdf(target, scope, { from, to }, issuedBy, filter);
    const name = ['statement', scope === 'all' ? '' : scope, from ?? '', to ?? ''].filter(Boolean).join('-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }),
);

/**
 * Whose ledger, which wallet, and which days — read once, for the list and for
 * the downloadable statement, so the two can never be asked the same question
 * and answer different ones.
 */
function readLedgerQuery(req: Parameters<Parameters<typeof transactionRoutes.get>[1]>[0]) {
  const target =
    req.user.roleId === ROLE.SUPER && req.query.user_id ? Number(req.query.user_id) : req.user.id;

  /*
    Split into two wallets only for somebody who holds both kinds of money.

    A laboratory and head office have one account. A transfer *received* by a
    laboratory is an employee handing on collections, not a float — so reading
    it through the staff split would file a laboratory's takings under
    "expense" and empty its collection wallet. The scope is ignored for them.
  */
  const asked = String(req.query.scope ?? 'all');
  const staff = req.user.roleId !== ROLE.SUPER && req.user.roleId !== ROLE.LAB;
  const scope: LedgerScope =
    staff && (asked === 'collection' || asked === 'expense') ? asked : 'all';

  // A period, as two inclusive dates. Anything that is not a date is refused
  // rather than ignored: a statement that silently covered all time when
  // somebody asked for March would be believed.
  const dateParam = (name: 'from' | 'to') => {
    const v = String(req.query[name] ?? '').trim();
    if (v === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
      throw badRequest(`${name} must be a date, YYYY-MM-DD.`);
    }
    return v;
  };
  const from = dateParam('from');
  const to = dateParam('to');
  if (from && to && from > to) throw badRequest('The start date is after the end date.');

  // Which rows to list. Refused when it is not a status this ledger has, for the
  // same reason as a bad date: an unknown status matching nothing looks like an
  // account with nothing in it.
  const rawStatus = String(req.query.status ?? '').trim();
  if (rawStatus !== '' && !['0', '1', '2'].includes(rawStatus)) {
    throw badRequest('status must be 0 (pending), 1 (approved) or 2 (declined).');
  }
  const status = rawStatus === '' ? null : Number(rawStatus);
  // Words to look for in the reference and the remark together.
  const q = String(req.query.q ?? '').trim().slice(0, 100) || null;
  // How it was paid: cash, upi, card, bank, cheque. Free text rather than a
  // fixed list, because the older rows carry whatever was typed at the time.
  const mode = String(req.query.mode ?? '').trim().slice(0, 40) || null;

  return { target, scope, from, to, status, q, mode };
}
