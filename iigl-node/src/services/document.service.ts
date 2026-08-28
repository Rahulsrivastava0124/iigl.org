import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import puppeteer from 'puppeteer';
import { db } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { asDataUri } from './card.service.js';
import { quoteOrder } from './pricing.service.js';

/**
 * Order paperwork: the receipt handed over when items are taken in, and the
 * invoice raised when the order is settled.
 *
 * Both come from one template. A receipt lists what was received and carries no
 * prices, because nothing is priced until the certificates exist. An invoice
 * adds the money.
 *
 * Invoice figures come from the pricing service rather than from the stored
 * columns, so an invoice and the settle screen can never disagree. The paid and
 * outstanding lines do come from the order, because those record what actually
 * changed hands.
 */

const TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/order-document.ejs',
);

export type DocumentKind = 'receipt' | 'invoice';

const money = (v: number | string | null | undefined) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('en-IN');

export async function orderDocumentHtml(orderId: number, kind: DocumentKind): Promise<string> {
  const order = await db
    .selectFrom('orders')
    .selectAll()
    .where('id', '=', orderId)
    .executeTakeFirst();
  if (!order) throw notFound('Order not found.');

  const [items, lab, categories] = await Promise.all([
    db.selectFrom('order_details').selectAll().where('order_id', '=', orderId).execute(),
    db
      .selectFrom('users')
      .select(['id', 'fullname', 'address', 'city', 'state', 'mobile', 'gst_no', 'signature'])
      .where('id', '=', Number(order.lab_id))
      .executeTakeFirst(),
    db.selectFrom('categories').select(['id', 'name']).execute(),
  ]);

  const categoryName = new Map(categories.map((c) => [Number(c.id), c.name]));

  // Priced only for an invoice: a receipt is raised before any certificate
  // exists, so every line would read zero and imply the work is free.
  let totals: {
    total_amount: number;
    discount: number;
    payable_amount: number;
    amount_with_gst: number;
    paid: number;
    dues: number;
  } | null = null;
  const amountByItem = new Map<number, number>();

  if (kind === 'invoice') {
    const quote = await quoteOrder(orderId, Number(order.discount ?? 0));
    const detailOf = new Map<number, number>();
    for (const c of quote.certificates) detailOf.set(c.report_id, c.line_total);

    // Group certificate totals back onto the order line each belongs to.
    const reports = await db
      .selectFrom('reports')
      .select(['id', 'order_detail_id'])
      .where(
        'order_detail_id',
        'in',
        items.length ? items.map((i) => String(i.id)) : ['-1'],
      )
      .execute();

    for (const r of reports) {
      const line = detailOf.get(Number(r.id));
      if (line == null) continue;
      const key = Number(r.order_detail_id);
      amountByItem.set(key, (amountByItem.get(key) ?? 0) + line);
    }

    totals = {
      total_amount: quote.total_amount,
      discount: quote.discount,
      payable_amount: quote.payable_amount,
      amount_with_gst: quote.amount_with_gst,
      paid: Number(order.paid_amount ?? 0),
      dues: Number(order.dues_amount ?? 0),
    };
  }

  const [logo, signature] = await Promise.all([
    asDataUri('public/card-logo.png'),
    asDataUri(lab?.signature ?? null),
  ]);

  return ejs.renderFile(
    TEMPLATE,
    {
      kind,
      order,
      lab,
      signature,
      logo,
      totals,
      money,
      verifyBase: env.publicSiteUrl,
      items: items.map((it) => ({
        ...it,
        category_name: categoryName.get(Number(it.category_id)) ?? null,
        amount: amountByItem.get(Number(it.id)) ?? null,
      })),
    },
    { async: true },
  );
}

export async function orderDocumentPdf(orderId: number, kind: DocumentKind): Promise<Buffer> {
  const html = await orderDocumentHtml(orderId, kind);

  // A separate browser from the card renderer would double the memory for no
  // gain, so this reuses the same one.
  const { renderHtmlToPdf } = await import('./pdf.service.js');
  return renderHtmlToPdf(html, { format: 'A4' });
}
