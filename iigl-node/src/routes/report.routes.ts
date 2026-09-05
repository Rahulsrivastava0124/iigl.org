import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { notFound } from '../lib/errors.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { assertLabOwnership, requireLabScope, ROLE } from '../middleware/auth.js';
import {
  createReport,
  expandAttributes,
  updateReport,
  validateReportInput,
  validateUpdateReportInput,
} from '../services/report.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const reportRoutes = Router();
reportRoutes.use(requireLabScope);

reportRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req);
    // Filters on reports.order_no, which holds the order id.
    const orderId = req.query.order_id ? String(Number(req.query.order_id)) : null;

    let q = db.selectFrom('reports').selectAll();
    let c = db.selectFrom('reports').select(db.fn.countAll().as('n'));

    if (req.user.roleId !== ROLE.SUPER) {
      q = q.where('lab_id', '=', req.user.labId);
      c = c.where('lab_id', '=', req.user.labId);
    }
    if (orderId) {
      q = q.where('order_no', '=', orderId);
      c = c.where('order_no', '=', orderId);
    }

    // `description` is the attribute blob and `item_image` a path, so neither
    // belongs in a search a person types.
    const search = readSearch(req, ['report_no', 'order_no', 'comments']);
    if (search) {
      q = q.where(search);
      c = c.where(search);
    }

    const [rows, count] = await Promise.all([
      q.orderBy('id', 'desc').limit(p.limit).offset(p.offset).execute(),
      c.executeTakeFirstOrThrow(),
    ]);

    /*
      Which cards this certificate is for.

      The kind is on the order line, not the certificate — a line asks for a
      smart card, a classic one, or both — and the list offered a print button
      for each kind on every row regardless. Half of them printed a card nobody
      ordered. One query over the lines on the page, folded onto the rows.
    */
    /*
      The order this certificate is on, by its number.

      `reports.order_no` is misnamed: it holds the order *id*, which is why the
      list read "#9616" while every other screen calls that order 202608-484662.
      The real number is resolved here and the id is kept beside it, so the cell
      can say what the order is called and still link to it.
    */
    const orderIds = [...new Set(rows.map((r) => Number(r.order_no)).filter(Boolean))];
    const orders = orderIds.length
      ? await db
          .selectFrom('orders')
          .select(['id', 'order_no'])
          .where('id', 'in', orderIds)
          .execute()
      : [];
    const orderNumberOf = new Map(orders.map((o) => [Number(o.id), o.order_no]));

    const detailIds = [...new Set(rows.map((r) => Number(r.order_detail_id)).filter(Boolean))];
    const lines = detailIds.length
      ? await db
          .selectFrom('order_details')
          .select(['id', 'smart_card', 'classic_card'])
          .where('id', 'in', detailIds)
          .execute()
      : [];
    const kindOf = new Map(lines.map((l) => [Number(l.id), l]));

    const expanded = await expandAttributes(rows.map((r) => r.description));
    const data = rows.map((r, i) => {
      const line = kindOf.get(Number(r.order_detail_id));
      return {
        ...r,
        attributes: expanded[i],
        order_id: Number(r.order_no) || null,
        order_number: orderNumberOf.get(Number(r.order_no)) ?? null,
        // A certificate whose line has gone offers both rather than neither:
        // the card exists and somebody may still need to reprint it.
        smart_card: line ? Number(line.smart_card) === 1 : true,
        classic_card: line ? Number(line.classic_card) === 1 : true,
      };
    });

    res.json(paged(data, Number(count.n), p));
  }),
);

reportRoutes.get(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('reports')
      .selectAll()
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('Report not found.');
    assertLabOwnership(req.user, Number(row.lab_id));

    const [attributes] = await expandAttributes([row.description]);
    res.json({ data: { ...row, attributes } });
  }),
);

reportRoutes.post(
  '/',
  wrap(async (req, res) => {
    const id = await createReport(req.user, validateReportInput(req.body));
    const row = await db
      .selectFrom('reports')
      .select(['id', 'report_no'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    res.status(201).json({ data: row });
  }),
);

/**
 * Amend an issued certificate. The report number is never reallocated — it is
 * printed on a document already in circulation.
 */
reportRoutes.patch(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('reports')
      .select(['id', 'lab_id'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('Report not found.');
    assertLabOwnership(req.user, Number(row.lab_id));

    await updateReport(Number(row.id), validateUpdateReportInput(req.body));

    const updated = await db
      .selectFrom('reports')
      .selectAll()
      .where('id', '=', Number(row.id))
      .executeTakeFirstOrThrow();
    const [attributes] = await expandAttributes([updated.description]);

    res.json({ data: { ...updated, attributes } });
  }),
);
