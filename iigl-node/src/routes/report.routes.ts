import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
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

    if (req.user.roleId !== ROLE.ADMIN) {
      q = q.where('lab_id', '=', req.user.labId);
      c = c.where('lab_id', '=', req.user.labId);
    }
    if (orderId) {
      q = q.where('order_no', '=', orderId);
      c = c.where('order_no', '=', orderId);
    }

    const [rows, count] = await Promise.all([
      q.orderBy('id', 'desc').limit(p.limit).offset(p.offset).execute(),
      c.executeTakeFirstOrThrow(),
    ]);

    const expanded = await expandAttributes(rows.map((r) => r.description));
    const data = rows.map((r, i) => ({ ...r, attributes: expanded[i] }));

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
