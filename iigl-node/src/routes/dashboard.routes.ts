import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { requireLabScope, ROLE } from '../middleware/auth.js';
import { ddmmyyyy } from '../services/order.service.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(requireLabScope);

/**
 * The tile counts behind the Laravel dashboards. orders.order_date is a
 * dd-mm-yyyy string, not a date column, so "today" is a string comparison —
 * matching how the PHP queries it.
 */
dashboardRoutes.get(
  '/summary',
  wrap(async (req, res) => {
    const isAdmin = req.user.roleId === ROLE.ADMIN;
    const labId = req.user.labId;
    const today = ddmmyyyy();

    const scopeOrders = <Q extends { where: any }>(q: Q): Q =>
      isAdmin ? q : (q.where('lab_id', '=', labId) as Q);

    const count = async (build: (q: any) => any) => {
      const row = await build(
        scopeOrders(db.selectFrom('orders').select(db.fn.countAll().as('n'))),
      ).executeTakeFirstOrThrow();
      return Number(row.n);
    };

    /**
     * Money is summed over delivered orders only, and the billed figure comes
     * from payable_amt rather than total_amount — matching
     * Admin\DashboardController@adminindex.
     *
     * The distinction matters: total_amount is the list price before discount,
     * payable_amt is what was actually charged. Summing the wrong one across
     * every order rather than the delivered ones overstated by 7,808 against
     * the Laravel figure.
     */
    const sum = async (
      column: 'payable_amt' | 'paid_amount' | 'dues_amount',
      todayOnly = false,
    ) => {
      let q = scopeOrders(
        db
          .selectFrom('orders')
          .select(db.fn.sum<number>(column).as('total'))
          .where('status', '=', 'delivered'),
      );
      if (todayOnly) q = q.where('order_date', '=', today);
      const row = await q.executeTakeFirstOrThrow();
      return Number(row.total ?? 0);
    };

    const [orders, active, delivered, todayOrders, totalSale, totalPaid, totalDues, todaySale] =
      await Promise.all([
        count((q) => q),
        count((q) => q.where('status', '=', 'preparing')),
        count((q) => q.where('status', '=', 'delivered')),
        count((q) => q.where('order_date', '=', today)),
        sum('payable_amt'),
        sum('paid_amount'),
        sum('dues_amount'),
        sum('payable_amt', true),
      ]);

    let reportsQuery = db.selectFrom('reports').select(db.fn.countAll().as('n'));
    if (!isAdmin) reportsQuery = reportsQuery.where('lab_id', '=', labId);
    const reports = Number((await reportsQuery.executeTakeFirstOrThrow()).n);

    res.json({
      data: {
        orders: { total: orders, active, delivered, today: todayOrders },
        reports: { total: reports },
        money: { sale: totalSale, paid: totalPaid, dues: totalDues, sale_today: todaySale },
      },
    });
  }),
);
