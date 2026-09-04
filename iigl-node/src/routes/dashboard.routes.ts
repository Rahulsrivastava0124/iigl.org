import { Router } from 'express';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { empidOf, requireLabScope, ROLE } from '../middleware/auth.js';
import { ddmmyyyy, live, liveJoined } from '../services/order.service.js';
import {
  accruedByLab,
  COMMISSION_TYPE,
  TRANSACTION_TYPE,
} from '../services/commission.service.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(requireLabScope);

/** Transaction status values, as stored. */
const TX_STATUS = { PENDING: 0, APPROVED: 1 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The tile counts behind the Laravel dashboards. orders.order_date is a
 * dd-mm-yyyy string, not a date column, so "today" is a string comparison —
 * matching how the PHP queries it.
 */
dashboardRoutes.get(
  '/summary',
  wrap(async (req, res) => {
    const isAdmin = req.user.roleId === ROLE.SUPER;
    const labId = req.user.labId;
    const today = ddmmyyyy();
    // `delivery_date` and `transactions.created_at` are datetimes, so the
    // laboratory figures below match them by ISO prefix rather than against the
    // dd-mm-yyyy text `order_date` holds.
    const isoToday = new Date().toISOString().slice(0, 10);
    const startOfToday = new Date(isoToday);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    // Scoped to the laboratory, and never counting a deleted order. The
    // deleted filter rides with the lab filter because every count and sum
    // on this screen already goes through here, so neither can be forgotten
    // at a single site.
    const scopeOrders = <Q extends { where: any }>(q: Q): Q => {
      const q2 = live(q);
      return isAdmin ? q2 : (q2.where('lab_id', '=', labId) as Q);
    };

    const count = async (build: (q: any) => any) => {
      const row = await build(
        scopeOrders(db.selectFrom('orders').select(db.fn.countAll().as('n'))),
      ).executeTakeFirstOrThrow();
      return Number(row.n);
    };

    /**
     * Money is summed over orders that have been billed, and the billed figure
     * comes from payable_amt rather than total_amount — matching
     * Admin\DashboardController@adminindex.
     *
     * The distinction matters: total_amount is the list price before discount,
     * payable_amt is what was actually charged. Summing the wrong one across
     * every order rather than the billed ones overstated by 7,808 against the
     * Laravel figure.
     *
     * **"Billed", not "delivered".** Laravel took the money and handed the
     * order over in one press, so `delivered` was a fair proxy for `settled`
     * and that is what this summed. They are two acts now — a customer pays on
     * account and collects on Friday — and an order paid for this morning
     * belongs in today's takings whether or not anybody has come for it. Every
     * row Laravel counted is still counted: a delivered order was settled, and
     * a legacy one that was never given a `payable_amt` is caught by the
     * status.
     */
    const sum = async (
      column: 'payable_amt' | 'paid_amount' | 'dues_amount',
      todayOnly = false,
    ) => {
      let q = scopeOrders(
        db
          .selectFrom('orders')
          .select(db.fn.sum<number>(column).as('total'))
          .where((eb) =>
            eb.or([eb('status', '=', 'delivered'), eb('payable_amt', 'is not', null)]),
          ),
      );
      if (todayOnly) q = q.where('order_date', '=', today);
      const row = await q.executeTakeFirstOrThrow();
      return Number(row.total ?? 0);
    };

    /**
     * Cards ordered, by kind. The flags live on the order line rather than on
     * the order, one line can carry both kinds, and `qty` is how many of that
     * kind the line is for — so each kind is the quantity summed over the
     * lines that set its flag, not a count of lines.
     */
    const cardsOfKind = async (flag: 'smart_card' | 'classic_card') => {
      let q = liveJoined(
        db
          .selectFrom('order_details')
          .innerJoin('orders', 'orders.id', 'order_details.order_id'),
      )
        .select(db.fn.sum<number>('order_details.qty').as('total'))
        .where(`order_details.${flag}` as 'order_details.smart_card', '=', 1);
      if (!isAdmin) q = q.where('orders.lab_id', '=', labId);
      const row = await q.executeTakeFirstOrThrow();
      return Number(row.total ?? 0);
    };

    /**
     * Customers are a view over orders — there is no customer table — grouped
     * by mobile, and "registered" means the order carries a GST number. Both
     * rules match the customer list, so the tile and the list agree.
     */
    const customers = async (registered: boolean) => {
      let q = live(db.selectFrom('orders')).select(
        db.fn.count<number>('mobile').distinct().as('n'),
      );
      if (!isAdmin) q = q.where('lab_id', '=', labId);
      q = registered
        ? q.where('gst', 'is not', null).where('gst', '!=', '')
        : q.where((eb) => eb.or([eb('gst', 'is', null), eb('gst', '=', '')]));
      const row = await q.executeTakeFirstOrThrow();
      return Number(row.n ?? 0);
    };

    /**
     * Commission a laboratory has accrued, on its own terms — a percentage of
     * what it collected, or a flat amount for each piece it certified. Both
     * the rate and the reading are per laboratory, so this is summed
     * laboratory by laboratory rather than by applying one rate to the whole
     * collection. The arithmetic itself lives in `accruedByLab`, which the
     * laboratory list and one laboratory's page read too: four screens report
     * this figure, and four copies of the sum is how they came to disagree.
     */
    const commissionAccrued = async () => {
      const byLab = await accruedByLab(isAdmin ? undefined : labId!);
      return round2([...byLab.values()].reduce((total, n) => total + n, 0));
    };

    /**
     * Commission actually posted. The administrator is the receiver on every
     * commission row and a laboratory is the sender, so the role decides which
     * side to read rather than both being summed together.
     */
    const commissionPosted = async (status: number) => {
      let q = db
        .selectFrom('transactions')
        .select(db.fn.sum<number>('amount').as('total'))
        .where('transaction_type', '=', TRANSACTION_TYPE.COMMISSION)
        .where('status', '=', status);
      if (!isAdmin) q = q.where('send_by', '=', req.user.id);
      const row = await q.executeTakeFirstOrThrow();
      return Number(row.total ?? 0);
    };

    /**
     * The signed-in account's own balance: approved money in less approved
     * money out. Pending rows are reported separately rather than folded in,
     * because a transfer nobody has approved has not moved.
     */
    const walletBalance = async () => {
      const side = async (column: 'received_by' | 'send_by') => {
        const row = await db
          .selectFrom('transactions')
          .select(db.fn.sum<number>('amount').as('total'))
          .where(column, '=', req.user.id)
          .where('status', '=', TX_STATUS.APPROVED)
          .executeTakeFirstOrThrow();
        return Number(row.total ?? 0);
      };
      const [credit, debit] = await Promise.all([side('received_by'), side('send_by')]);
      return round2(credit - debit);
    };

    /** Laboratories, and staff. A laboratory counts its own staff only. */
    const laboratories = async () => {
      if (!isAdmin) return null;
      const row = await db
        .selectFrom('users')
        .select(db.fn.countAll().as('n'))
        .where('role_id', '=', ROLE.LAB)
        .executeTakeFirstOrThrow();
      return Number(row.n);
    };

    const employees = async () => {
      let q = db
        .selectFrom('employements')
        .select(db.fn.countAll().as('n'))
        .where('is_working', '=', '1');
      if (!isAdmin) {
        // `parent_id` names the employer by empid, and the session carries a
        // user id. No empid means nobody can be employed here, so the count is
        // zero rather than a query matching NULL.
        const empid = await empidOf(labId!);
        if (!empid) return 0;
        q = q.where('parent_id', '=', empid);
      }
      const row = await q.executeTakeFirstOrThrow();
      return Number(row.n);
    };

    /**
     * The figures the Laravel laboratory dashboard showed, which are not the
     * administrator's figures scoped down — they are different quantities.
     *
     * `Member\DashboardController@index` is the source. Three of its queries
     * are quirks rather than choices, and are carried over as they are because
     * a laboratory reconciles its wallet against what that screen has been
     * telling it for years; each is marked below.
     *
     * Null for head office, which has no employer of its own and sees the
     * administrator's dashboard instead.
     */
    const labFigures = async () => {
      if (isAdmin) return null;
      const me = req.user.id;
      const empid = await empidOf(labId!);

      /** Reports generated on lines of one card kind. */
      const generated = async (flag: 'smart_card' | 'classic_card') => {
        const row = await db
          .selectFrom('reports')
          .innerJoin('order_details', 'order_details.id', 'reports.order_detail_id')
          .select(db.fn.countAll().as('n'))
          .where(`order_details.${flag}` as 'order_details.smart_card', '=', 1)
          .where('reports.lab_id', '=', labId)
          .executeTakeFirstOrThrow();
        return Number(row.n);
      };

      /**
       * Everything this laboratory's staff have taken in.
       *
       * **Quirk, carried over:** no status filter. A collection nobody has
       * approved counts here exactly as an approved one does, so this is money
       * received rather than money cleared. The Laravel query is the same, and
       * the Paid and Dues tiles are read against it.
       */
      const collectedByStaff = async () => {
        if (!empid) return 0;
        const row = await db
          .selectFrom('transactions')
          .select(db.fn.sum<number>('transactions.amount').as('total'))
          .where('transactions.received_by', 'in', (eb) =>
            eb.selectFrom('employements').select('user_id').where('parent_id', '=', empid),
          )
          .executeTakeFirstOrThrow();
        return Number(row.total ?? 0);
      };

      /**
       * Money the laboratory took at its own counter.
       *
       * `collectedByStaff` reads collections received by the laboratory's
       * *employees*, through `employements.parent_id` — and a laboratory is not
       * on its own books, so everything it took itself counted nowhere and both
       * wallet tiles stayed at zero however much came in.
       */
      const collectedByLab = async () => {
        const row = await db
          .selectFrom('transactions')
          .select(db.fn.sum<number>('amount').as('total'))
          .where('transaction_type', '=', TRANSACTION_TYPE.ORDER_COLLECTION)
          .where('received_by', '=', me)
          .executeTakeFirstOrThrow();
        return Number(row.total ?? 0);
      };

      /** Approved wallet transfers into this laboratory. */
      const walletIn = async () => {
        const row = await db
          .selectFrom('transactions')
          .select(db.fn.sum<number>('amount').as('total'))
          .where('transaction_type', '=', TRANSACTION_TYPE.WALLET_TRANSFER)
          .where('received_by', '=', me)
          .where('status', '=', TX_STATUS.APPROVED)
          .executeTakeFirstOrThrow();
        return Number(row.total ?? 0);
      };

      /** Approved money sent on to head office. */
      const sentToHeadOffice = async () => {
        const row = await db
          .selectFrom('transactions')
          .select(db.fn.sum<number>('amount').as('total'))
          .where('received_by', '=', ROLE.SUPER)
          .where('send_by', '=', me)
          .where('status', '=', TX_STATUS.APPROVED)
          .executeTakeFirstOrThrow();
        return Number(row.total ?? 0);
      };

      /** Cards ordered, by kind, over this laboratory's orders. */
      const ordered = async (flag: 'smart_card' | 'classic_card', todayOnly = false) => {
        let q = liveJoined(
          db
            .selectFrom('order_details')
            .innerJoin('orders', 'orders.id', 'order_details.order_id'),
        )
          .select(db.fn.sum<number>('order_details.qty').as('total'))
          .where(`order_details.${flag}` as 'order_details.smart_card', '=', 1)
          .where('orders.lab_id', '=', labId);
        if (todayOnly) q = q.where('orders.order_date', '=', today);
        const row = await q.executeTakeFirstOrThrow();
        return Number(row.total ?? 0);
      };

      /**
       * Billed today.
       *
       * **Quirk, carried over:** dated by `delivery_date` and counted whatever
       * the order's status, where the all-time Total Sale beside it counts only
       * delivered orders. The two tiles are not the same measure at two scales,
       * and never were.
       */
      /** Orders this laboratory took money on today. */
      const settledToday = () =>
        db
          .selectFrom('transactions')
          .select('order_id')
          .where('transaction_type', '=', TRANSACTION_TYPE.ORDER_COLLECTION)
          .where('created_at', '>=', startOfToday)
          .where('created_at', '<', startOfTomorrow);

      const saleToday = async () => {
        const row = await live(db.selectFrom('orders'))
          .select(db.fn.sum<number>('payable_amt').as('total'))
          .where('lab_id', '=', labId)
          // Billed today, or handed over today. Paying and delivering are two
          // acts, and an order billed this morning is today's sale whether or
          // not the customer has been back for it.
          .where((eb) =>
            eb.or([
              eb('delivery_date', 'like', `${isoToday}%`),
              eb('id', 'in', settledToday()),
            ]),
          )
          .executeTakeFirstOrThrow();
        return Number(row.total ?? 0);
      };

      /**
       * Taken in today: money dated by when it was taken.
       *
       * Laravel also required the order to have been *delivered* today, which
       * made sense while paying and delivering were one press and made none
       * afterwards — an order delivered yesterday and paid this morning
       * appeared on neither day's tile. The date on the payment is the date the
       * money arrived, and that is the whole of it.
       */
      const paidToday = async () => {
        const row = await liveJoined(
          db
            .selectFrom('transactions')
            .innerJoin('orders', 'orders.id', 'transactions.order_id'),
        )
          .select(db.fn.sum<number>('transactions.amount').as('total'))
          .where('orders.lab_id', '=', labId)
          // `created_at` is a datetime rather than the text the date columns
          // hold, so today is a half-open range on it, not a prefix match.
          .where('transactions.created_at', '>=', startOfToday)
          .where('transactions.created_at', '<', startOfTomorrow)
          .executeTakeFirstOrThrow();
        return Number(row.total ?? 0);
      };

      const [
        smartOrdered,
        classicOrdered,
        smartGenerated,
        classicGenerated,
        collected,
        walletCredit,
        collectedHere,
        transferred,
        smartToday,
        classicToday,
        todaySaleLab,
        todayPaidLab,
        rate,
      ] = await Promise.all([
        ordered('smart_card'),
        ordered('classic_card'),
        generated('smart_card'),
        generated('classic_card'),
        collectedByStaff(),
        walletIn(),
        collectedByLab(),
        sentToHeadOffice(),
        ordered('smart_card', true),
        ordered('classic_card', true),
        saleToday(),
        paidToday(),
        db
          .selectFrom('users')
          .select(['commision', 'commission_type'])
          .where('id', '=', me)
          .executeTakeFirst()
          .then((r) => ({
            rate: Number(r?.commision ?? 0),
            perPiece: r?.commission_type === COMMISSION_TYPE.PER_PIECE,
          })),
      ]);

      // What is left in the laboratory's own wallet after what it has passed
      // on: what its staff have handed in, plus what it took at its own
      // counter, less what it has sent to head office.
      const myWallet = round2(walletCredit + collectedHere - transferred);

      /*
        What head office is owed, on this laboratory's own terms.

        On a percentage the commission is a share of money, so it is taken from
        what the laboratory is holding — the Laravel formula, unchanged.

        On per-piece terms money is not the base at all: the agreement is a flat
        amount for every piece certified, and a share of the wallet is not a
        figure anybody agreed to. That case reads the same accrual the rest of
        the panel does, so this tile and the laboratory list cannot disagree
        about what the same franchise owes.
      */
      const adminCommission = rate.perPiece
        ? ((await accruedByLab(labId!)).get(labId!) ?? 0)
        : round2((myWallet * rate.rate) / 100);

      return {
        cards_ordered: smartOrdered + classicOrdered,
        cards_generated: smartGenerated + classicGenerated,
        smart_generated: smartGenerated,
        classic_generated: classicGenerated,
        /*
          Everything taken in for this laboratory: what its staff collected and
          what it collected itself at its own counter.

          `collectedByStaff` reads collections received by the laboratory's
          employees, through `employements.parent_id` — and a laboratory is not
          on its own books. Paid Amount therefore read zero however much the
          counter had taken, and the Dues tile beside it, which is the sale less
          this, showed the whole bill as outstanding.
        */
        collected: round2(collected + collectedHere),
        // Staff-held money only, and never negative: staff holding less than
        // has been transferred in is a float, not a debt. What the laboratory
        // took itself is in its own wallet, not in theirs.
        employee_wallet: round2(Math.max(0, collected - walletCredit)),
        my_wallet: myWallet,
        admin_commission: adminCommission,
        today: {
          cards_ordered: smartToday + classicToday,
          sale: round2(todaySaleLab),
          paid: round2(todayPaidLab),
          dues: round2(Math.max(0, todaySaleLab - todayPaidLab)),
        },
      };
    };

    const [
      orders,
      active,
      delivered,
      todayOrders,
      todayActive,
      totalSale,
      totalPaid,
      totalDues,
      todaySale,
      todayPaid,
      todayDues,
      smartCards,
      classicCards,
      accrued,
      paidCommission,
      pendingCommission,
      balance,
      labCount,
      staffCount,
      registeredCustomers,
      unregisteredCustomers,
    ] = await Promise.all([
      count((q) => q),
      count((q) => q.where('status', '=', 'preparing')),
      count((q) => q.where('status', '=', 'delivered')),
      count((q) => q.where('order_date', '=', today)),
      count((q) => q.where('order_date', '=', today).where('status', '=', 'preparing')),
      sum('payable_amt'),
      sum('paid_amount'),
      sum('dues_amount'),
      sum('payable_amt', true),
      sum('paid_amount', true),
      sum('dues_amount', true),
      cardsOfKind('smart_card'),
      cardsOfKind('classic_card'),
      commissionAccrued(),
      commissionPosted(TX_STATUS.APPROVED),
      commissionPosted(TX_STATUS.PENDING),
      walletBalance(),
      laboratories(),
      employees(),
      customers(true),
      customers(false),
    ]);

    const lab = await labFigures();

    let reportsQuery = db.selectFrom('reports').select(db.fn.countAll().as('n'));
    if (!isAdmin) reportsQuery = reportsQuery.where('lab_id', '=', labId);
    const reports = Number((await reportsQuery.executeTakeFirstOrThrow()).n);

    res.json({
      data: {
        orders: { total: orders, active, delivered, today: todayOrders, active_today: todayActive },
        reports: { total: reports },
        cards: { smart: smartCards, classic: classicCards },
        // The three today figures come from the same set of orders — delivered,
        // dated today — so sale less paid is dues, and the row adds up. The
        // Laravel dashboard took its today's-paid from `transactions` and its
        // today's-sale from `delivery_date` instead, and the two never
        // reconciled against each other; see the note in FEATURE-GAP.md.
        money: {
          sale: totalSale,
          paid: totalPaid,
          dues: totalDues,
          sale_today: todaySale,
          paid_today: todayPaid,
          dues_today: todayDues,
        },
        wallet: {
          balance,
          commission_accrued: accrued,
          commission_paid: round2(paidCommission),
          // What the rate says is owed, less what has been approved. Never
          // negative: an overpayment is a wallet balance, not a debt.
          commission_dues: round2(Math.max(0, accrued - paidCommission)),
          on_approval: round2(pendingCommission),
        },
        // What the Laravel laboratory dashboard showed, and only a laboratory
        // has: null for head office, whose dashboard is a different screen.
        lab,
        people: {
          laboratories: labCount,
          employees: staffCount,
          customers_registered: registeredCustomers,
          customers_unregistered: unregisteredCustomers,
        },
      },
    });
  }),
);

/**
 * Twelve months of orders and certificates, for the dashboard chart.
 *
 * `orders.order_date` is a dd-mm-yyyy string rather than a date column, so the
 * month has to be parsed out of it — the same reason "today" upstairs is a
 * string comparison. Certificates carry a real `created_at`, so they are
 * grouped directly.
 *
 * Deliberately not money: `payable_amt` is 0 on most recent orders, so a
 * revenue line would draw a collapse that did not happen.
 */
dashboardRoutes.get(
  '/trend',
  wrap(async (req, res) => {
    const isAdmin = req.user.roleId === ROLE.SUPER;
    const labId = req.user.labId ?? 0;
    const scope = (column: string) =>
      isAdmin ? sql`1 = 1` : sql`${sql.raw(column)} = ${labId}`;

    const months = 12;

    const orders = await sql<{ ym: string; n: number }>`
      select date_format(str_to_date(order_date, '%d-%m-%Y'), '%Y-%m') as ym,
             count(*) as n
        from orders
       where str_to_date(order_date, '%d-%m-%Y')
             >= date_sub(date_format(curdate(), '%Y-%m-01'), interval ${months - 1} month)
         and ${scope('lab_id')}
       group by ym
    `.execute(db);

    const reports = await sql<{ ym: string; n: number }>`
      select date_format(created_at, '%Y-%m') as ym, count(*) as n
        from reports
       where created_at
             >= date_sub(date_format(curdate(), '%Y-%m-01'), interval ${months - 1} month)
         and ${scope('lab_id')}
       group by ym
    `.execute(db);

    const countOf = (rows: { ym: string; n: number }[]) =>
      new Map(rows.map((r) => [r.ym, Number(r.n)]));
    const byOrder = countOf(orders.rows);
    const byReport = countOf(reports.rows);

    // Every month in the window is emitted, including the empty ones: a gap
    // the chart skips would draw a flat line across a month with no orders.
    const now = new Date();
    const data = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        month: ym,
        label: d.toLocaleString('en-IN', { month: 'short' }),
        orders: byOrder.get(ym) ?? 0,
        reports: byReport.get(ym) ?? 0,
      };
    });

    res.json({ data });
  }),
);
