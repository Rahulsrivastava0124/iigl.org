import { readFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { db } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { expandAttributes } from './report.service.js';
import { env } from '../lib/env.js';
import { getObjectBuffer } from '../lib/storage.js';

/**
 * Assembles everything a certificate card needs to render.
 *
 * Images are inlined as data URIs rather than linked. The renderer runs in a
 * headless browser with no access to the PHP document root, and an inlined
 * asset also means a card cannot silently lose its logo because a path moved.
 */

/** Where the Laravel public/ directory lives, for logos and uploads. */
const PUBLIC_ROOT = env.legacyPublicRoot;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const assetCache = new Map<string, string | null>();

/**
 * Reads an asset and returns it as a data URI, or null when it is missing.
 * Stored paths look like `public/uploads/report/123main.jpg`, relative to the
 * Laravel project root, so the leading `public/` is stripped.
 *
 * Disk first, then R2 — the same order `/api/files` uses, and for the same
 * reason: everything Laravel wrote is on disk, everything since is in the
 * bucket, and a stat is cheaper than a request. A card whose image is in
 * neither renders without it rather than failing.
 */
export async function asDataUri(storedPath: string | null | undefined): Promise<string | null> {
  if (!storedPath) return null;
  if (assetCache.has(storedPath)) return assetCache.get(storedPath) ?? null;

  const relative = storedPath.replace(/^\/?public\//, '').replace(/^\/+/, '');
  const absolute = path.resolve(PUBLIC_ROOT, relative);
  const mime = MIME[path.extname(relative).toLowerCase()] ?? 'application/octet-stream';

  // Never read outside the public root, whatever the database holds.
  const insideRoot = absolute.startsWith(path.resolve(PUBLIC_ROOT));

  let buffer: Buffer | null = null;
  if (insideRoot) {
    buffer = await readFile(absolute).catch(() => null);
  }
  buffer ??= await getObjectBuffer(relative);

  const uri = buffer ? `data:${mime};base64,${buffer.toString('base64')}` : null;
  assetCache.set(storedPath, uri);
  return uri;
}

export interface CardData {
  report_no: string;
  report_id: number;
  /** Null when the certificate records none; the row is then left off. */
  gross_weight: string | null;
  gross_wt_unit: string | null;
  carat_weight: string;
  stone_wt_unit: string | null;
  size: string | null;
  comments: string | null;
  is_approx: boolean;
  subcategory: string | null;
  issued_on: string;
  /** The same day as `issued_on`, written `dd-mm-yyyy` as the classic card prints it. */
  issued_on_ddmmyyyy: string;
  item_image: string | null;
  signature: string | null;
  /** The customer's name, when their order asked for it on the card. */
  customer_name: string | null;
  /** The customer's own logo, when their order asked for it. */
  customer_image: string | null;
  /** The issuing laboratory's address, printed on the plain smart card. */
  lab_address: string | null;
  qr: string;
  verify_url: string;
  smart_attributes: Array<{ name: string; value: string }>;
  classic_attributes: Array<{ name: string; value: string; description: string | null }>;
}

/** Shared chrome: logos and the background watermark, read once. */
export interface CardChrome {
  cardLogo: string | null;
  backLogo: string | null;
  /** The back block the headed card overlays the laboratory's address on. */
  backBlock: string | null;
  watermark: string | null;
}

export async function loadChrome(): Promise<CardChrome> {
  const [cardLogo, backLogo, backBlock, watermark] = await Promise.all([
    asDataUri('public/card-logo.png'),
    asDataUri('public/back-logo.png'),
    /*
      `2.png` is what `smartCardwithheader` puts on the back: the IIGL block
      with the ISO mark, and a gap under the name where the **issuing
      laboratory's** address is overlaid. `back-logo.png` is the same block with
      head office's own address printed into the image, which is why the headed
      card cannot use it — the address on this card is the laboratory's.
    */
    asDataUri('public/2.png'),
    asDataUri('public/bg.png'),
  ]);
  return { cardLogo, backLogo, backBlock, watermark };
}

/**
 * A measurement that is actually a measurement.
 *
 * These columns are `varchar` and hold `'0'` for "not recorded" — 13,979 of the
 * 22,407 live certificates have no gross weight and 10,522 no dimensions. The
 * Laravel cards hid those rows, with `@if($report->gross_weight>0)` and
 * `@if($report->size)`, and PHP reads the string `'0'` as false, so both
 * conditions did what they look like they do.
 *
 * Ported to EJS they stopped: `'0'` is a non-empty string, which JavaScript
 * reads as true. Every certificate without a gross weight printed `Gross Wt 0`
 * and every one without dimensions printed `Dimensions 0` — a stated
 * measurement of nothing, on a document a customer keeps.
 *
 * So the emptiness is decided here rather than in either template, once, and
 * the templates test for null.
 */
function measured(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  // '0', '0.00', '0.000' — a number that is zero, however it was written.
  const n = Number(text);
  if (Number.isFinite(n) && n === 0) return null;
  return text;
}

/**
 * A customer's name as a card prints it.
 *
 * Title case and cut at fifteen characters, which are Laravel's two rules for
 * this field. The cut is not cosmetic: the card is 8.7cm wide and the name
 * shares its row with the IIGL logo, so a long one pushed the logo off the
 * card altogether.
 */
function shortName(name: string): string {
  const trimmed = name.trim();
  const cut = trimmed.length > 15 ? `${trimmed.slice(0, 15)}...` : trimmed;
  // The first letter of each word, which is what `ucwords(strtolower(...))` did.
  return cut.toLowerCase().replace(/(^|\s)(\p{Ll})/gu, (_, gap, letter) => gap + letter.toUpperCase());
}

/**
 * Builds card data for a set of reports in a fixed number of queries, so
 * printing forty cards does not issue forty times the work.
 */
export async function cardDataFor(reportIds: number[]): Promise<CardData[]> {
  if (reportIds.length === 0) return [];

  const reports = await db
    .selectFrom('reports')
    .selectAll()
    .where('id', 'in', reportIds)
    .execute();

  if (reports.length === 0) throw notFound('No certificates found.');

  /*
    The order each certificate was written for.

    `reports.order_no` holds the order **id**, not the order number — the column
    is misnamed and every reader in this codebase says so. It is needed here
    because a smart card carries two things the certificate does not know: the
    customer's name, and the customer's own logo. Both are the order's
    settings, ticked at the counter when the order was taken, and the Laravel
    card printed them beside the IIGL logo.
  */
  const orderIds = [...new Set(reports.map((r) => Number(r.order_no)).filter(Boolean))];

  const [subcategories, units, labs, orders, expanded] = await Promise.all([
    db.selectFrom('subcategories').select(['id', 'name']).execute(),
    db.selectFrom('units').select(['id', 'name', 'symbol']).execute(),
    db
      .selectFrom('users')
      // The address is the whole of the plain card's back panel — Laravel's
      // `multsmart` prints `address city state pincode` there and nothing else.
      .select(['id', 'signature', 'address', 'city', 'state', 'pincode'])
      .where(
        'id',
        'in',
        [...new Set(reports.map((r) => Number(r.lab_id)))],
      )
      .execute(),
    orderIds.length
      ? db
          .selectFrom('orders')
          .select([
            'id',
            'customer_name',
            'show_name_in_card',
            'show_image_in_card',
            'show_image_in_card_file',
          ])
          .where('id', 'in', orderIds)
          .execute()
      : Promise.resolve([]),
    expandAttributes(reports.map((r) => r.description)),
  ]);

  const subById = new Map(subcategories.map((s) => [Number(s.id), s.name]));
  const unitById = new Map(units.map((u) => [Number(u.id), u.symbol || u.name]));
  const signatureByLab = new Map(labs.map((l) => [Number(l.id), l.signature]));

  /* `address city state pincode`, as the two smart blades compose it, with the
     empty parts left out rather than printed as gaps. */
  const addressByLab = new Map(
    labs.map((l) => [
      Number(l.id),
      [l.address, l.city, l.state, l.pincode]
        .map((part) => String(part ?? '').trim())
        .filter(Boolean)
        .join(' ') || null,
    ]),
  );
  const orderById = new Map(orders.map((o) => [Number(o.id), o]));

  // Preserve the order the caller asked for, not the order MySQL returned.
  const byId = new Map(reports.map((r, i) => [Number(r.id), { report: r, attributes: expanded[i] }]));

  const out: CardData[] = [];
  for (const id of reportIds) {
    const entry = byId.get(id);
    if (!entry) continue;
    const { report, attributes } = entry;

    const ordered = [...attributes].sort((a, b) => Number(a.order_no) - Number(b.order_no));
    const verifyUrl = `${env.publicSiteUrl}/verify-report/${report.id}`;

    /*
      What the counter ticked for this order.

      `show_name_in_card` and `show_image_in_card` are the customer's own
      branding on the card — their name, their logo — and Laravel's
      `smartCardwithheader` printed both beside IIGL's. 2,107 of the 9,759 live
      orders ask for the name and 74 for the image, so leaving them off was not
      a corner case: a fifth of reprinted cards came back missing the name the
      customer asked to have on them.

      A flag with no file behind it prints nothing rather than a broken frame —
      eight live orders are in exactly that state.
    */
    const order = orderById.get(Number(report.order_no));
    const wantsName = Boolean(order && Number(order.show_name_in_card) !== 0 && order.customer_name);
    const wantsImage = Boolean(
      order && Number(order.show_image_in_card) !== 0 && order.show_image_in_card_file,
    );

    const [itemImage, signature, customerImage, qr] = await Promise.all([
      asDataUri(report.item_image),
      asDataUri(signatureByLab.get(Number(report.lab_id)) ?? null),
      wantsImage ? asDataUri(order!.show_image_in_card_file) : Promise.resolve(null),
      QRCode.toDataURL(verifyUrl, { margin: 0, width: 300, errorCorrectionLevel: 'M' }),
    ]);

    out.push({
      report_no: report.report_no,
      report_id: Number(report.id),
      // Null where the certificate records none, so a card can leave the row
      // out rather than state a measurement of zero. See `measured`.
      gross_weight: measured(report.gross_weight),
      gross_wt_unit: unitById.get(Number(report.gross_wt_unit)) ?? null,
      carat_weight: report.carat_weight,
      stone_wt_unit: unitById.get(Number(report.stone_wt_unit)) ?? null,
      size: measured(report.size),
      comments: report.comments,
      is_approx: Boolean(report.is_approx),
      subcategory: subById.get(Number(report.subcategory_id)) ?? null,
      issued_on: report.created_at ? String(report.created_at).slice(0, 10) : '',
      /*
        The same date the classic card prints, `d-m-Y` — which is how the card
        has always shown it and how every other date in this panel is written.
        Kept beside the ISO one rather than formatted in the template, so the
        two cannot disagree about which day a certificate was issued.
      */
      issued_on_ddmmyyyy: report.created_at
        ? String(report.created_at).slice(0, 10).split('-').reverse().join('-')
        : '',
      item_image: itemImage,
      signature,
      /*
        The customer's name as the card prints it: title case, and cut at
        fifteen characters with an ellipsis. Both are Laravel's rules, kept
        because the card is 8.7cm wide and a long name pushed the IIGL logo off
        it — which is what the truncation was there to stop.
      */
      customer_name: wantsName ? shortName(String(order!.customer_name)) : null,
      customer_image: customerImage,
      /** The issuing laboratory's address, which the plain smart card prints. */
      lab_address: addressByLab.get(Number(report.lab_id)) ?? null,
      qr,
      verify_url: verifyUrl,
      smart_attributes: ordered
        .filter((a) => a.show_in_smart_card && a.value)
        .map((a) => ({ name: a.attr_name ?? '', value: String(a.value) })),
      classic_attributes: ordered
        .filter((a) => a.show_in_classic_card && a.value)
        .map((a) => ({
          name: a.attr_name ?? '',
          value: String(a.value),
          description: a.description,
        })),
    });
  }

  return out;
}
