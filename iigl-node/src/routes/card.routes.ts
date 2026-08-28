import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, notFound } from '../lib/errors.js';
import { assertLabOwnership, requireLabScope, ROLE } from '../middleware/auth.js';
import { cardDataFor, loadChrome } from '../services/card.service.js';
import { renderCardsHtml, renderCardsPdf, type CardKind } from '../services/pdf.service.js';
import { orderDocumentHtml, orderDocumentPdf, type DocumentKind } from '../services/document.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const cardRoutes = Router();
cardRoutes.use(requireLabScope);

/** Batch printing is capped so one request cannot tie up the renderer. */
const MAX_CARDS = 50;

function kindFrom(raw: string): CardKind {
  if (raw === 'smart' || raw === 'classic') return raw;
  throw badRequest('Card type must be smart or classic.');
}

/** Loads reports the caller is allowed to print, preserving the requested order. */
async function authorisedReports(
  user: Express.Request['user'],
  ids: number[],
): Promise<number[]> {
  const rows = await db
    .selectFrom('reports')
    .select(['id', 'lab_id'])
    .where('id', 'in', ids)
    .execute();

  const found = new Map(rows.map((r) => [Number(r.id), Number(r.lab_id)]));

  for (const id of ids) {
    const labId = found.get(id);
    if (labId === undefined) throw notFound(`Certificate ${id} not found.`);
    assertLabOwnership(user, labId);
  }

  return ids;
}

function send(res: Parameters<Parameters<typeof cardRoutes.get>[1]>[1], pdf: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-Length', String(pdf.length));
  res.end(pdf);
}

/**
 * The data behind a card, without rendering it. Useful for a preview screen.
 * Registered before /:kind/:id, which would otherwise match this path with
 * kind = "data".
 */
cardRoutes.get(
  '/data/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    await authorisedReports(req.user, [id]);

    const cards = await cardDataFor([id]);
    if (cards.length === 0) throw notFound('Certificate not found.');

    // The images are large data URIs; the preview only needs to know they exist.
    const { qr, item_image, signature, ...rest } = cards[0];
    res.json({
      data: {
        ...rest,
        has_item_image: Boolean(item_image),
        has_signature: Boolean(signature),
        qr,
      },
    });
  }),
);

/**
 * One certificate as a PDF. `?format=html` returns the rendered markup
 * instead, which is what to compare against the Laravel output when checking
 * for visual drift.
 */
cardRoutes.get(
  '/:kind/:id',
  numericId,
  wrap(async (req, res) => {
    const kind = kindFrom(String(req.params.kind));
    const id = Number(req.params.id);

    await authorisedReports(req.user, [id]);

    const [cards, chrome] = await Promise.all([cardDataFor([id]), loadChrome()]);
    if (cards.length === 0) throw notFound('Certificate not found.');

    if (req.query.format === 'html') {
      res.type('html').send(await renderCardsHtml(kind, cards, chrome));
      return;
    }

    send(res, await renderCardsPdf(kind, cards, chrome), `${cards[0].report_no}-${kind}.pdf`);
  }),
);

/**
 * Several certificates in one PDF, for a print run. Matches the multi smart
 * card screens the laboratory and employee portals both offer.
 */
cardRoutes.post(
  '/:kind',
  wrap(async (req, res) => {
    const kind = kindFrom(String(req.params.kind));
    const raw = (req.body ?? {}).report_ids;

    if (!Array.isArray(raw) || raw.length === 0) {
      throw badRequest('Provide report_ids: a list of certificate ids to print.');
    }
    if (raw.length > MAX_CARDS) {
      throw badRequest(`Print at most ${MAX_CARDS} certificates at once. You sent ${raw.length}.`);
    }

    const ids = raw.map((v: unknown) => {
      const n = Number(v);
      if (!Number.isInteger(n)) throw badRequest('Every report id must be a number.');
      return n;
    });

    await authorisedReports(req.user, ids);

    const [cards, chrome] = await Promise.all([cardDataFor(ids), loadChrome()]);

    if (req.query.format === 'html') {
      res.type('html').send(await renderCardsHtml(kind, cards, chrome));
      return;
    }

    send(res, await renderCardsPdf(kind, cards, chrome), `iigl-${kind}-cards.pdf`);
  }),
);

export { ROLE };

/**
 * Order paperwork: a receipt when items are taken in, an invoice when the order
 * is settled. Registered before /:kind/:id so "receipt" and "invoice" are not
 * mistaken for a card type.
 */
cardRoutes.get(
  '/order/:kind/:id',
  numericId,
  wrap(async (req, res) => {
    const kind = String(req.params.kind);
    if (kind !== 'receipt' && kind !== 'invoice') {
      throw badRequest('Document must be a receipt or an invoice.');
    }

    const id = Number(req.params.id);
    const order = await db
      .selectFrom('orders')
      .select(['id', 'lab_id', 'order_no'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!order) throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));

    if (req.query.format === 'html') {
      res.type('html').send(await orderDocumentHtml(id, kind as DocumentKind));
      return;
    }

    send(
      res,
      await orderDocumentPdf(id, kind as DocumentKind),
      `${order.order_no}-${kind}.pdf`,
    );
  }),
);
