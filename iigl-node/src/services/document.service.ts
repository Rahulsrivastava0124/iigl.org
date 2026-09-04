import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import puppeteer from 'puppeteer';
import { db } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { asDataUri } from './card.service.js';
import { setting } from './settings.service.js';
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

/* --------------------------------------------------------- franchisee form */

const FRANCHISEE_TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/franchisee-form.ejs',
);

/**
 * The Franchisee Form for one laboratory, as the printed one is laid out.
 *
 * Filled from the laboratory's record where the record has the answer, and
 * left blank where it does not — the KYC ticks, the bank branch, the sponsor
 * and the whole acknowledgement stub are filled in by hand at the counter, and
 * a form that invented them would be worse than one that leaves the line.
 *
 * The company block comes from Settings rather than the template, so an
 * address change is one edit and not a redeploy.
 */
/**
 * Options for the printed form.
 *
 * `blank` prints the same form with nothing filled in: the letterhead, the
 * labels, the boxes and the acknowledgement stub, and empty lines everywhere a
 * value would go. Head office hands these out at counters and at trade fairs,
 * and the alternative — printing somebody else's laboratory and asking people
 * to ignore the details — puts one applicant's bank account in front of the
 * next one.
 */
export interface FranchiseeFormOptions {
  blank?: boolean;
}

export async function franchiseeFormHtml(
  labId: number,
  options: FranchiseeFormOptions = {},
): Promise<string> {
  const lab = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', labId)
    .executeTakeFirst();
  if (!lab) throw notFound('Laboratory not found.');

  const [company, photo, signature] = await Promise.all([
    Promise.all(
      ['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'website'].map((k) =>
        setting(`company.${k}`),
      ),
    ).then(([name, address, city, state, pincode, phone, email, website]) => ({
      name,
      address,
      city,
      state,
      pincode,
      phone,
      email,
      website,
    })),
    /*
      The picture for the photo panel.

      A laboratory's own photograph first, its logo second: a franchise is as
      likely to have put up a shopfront logo as a portrait, and a form printed
      with an empty box when the account holds a perfectly good image is a
      form somebody has to explain. Neither, and the box prints as the paper
      one does — empty, to have a photograph stapled into it.
    */
    options.blank ? Promise.resolve(null) : asDataUri(lab.profile_photo).then((p) => p ?? asDataUri(lab.company_logo)),
    options.blank ? Promise.resolve(null) : asDataUri(lab.signature),
  ]);

  /*
    A blank form is the same template with an empty record, not a second
    template. One layout, printed twice: nothing can drift between the form
    somebody fills in by hand and the form that comes back filled from the
    account, because there is only one of them.

    The laboratory is still looked up — an id that names nobody is still a
    404 — and its name still titles the document, so the tab and the file are
    identifiable even when the sheet itself is empty.
  */
  const printed = options.blank ? ({ id: lab.id } as typeof lab) : lab;

  return ejs.renderFile(
    FRANCHISEE_TEMPLATE,
    {
      lab: printed,
      title: lab.fullname ?? '',
      company,
      photo,
      signature,
      // The round mark, not `brandLogo()`.
      //
      // That helper prefers the legacy `card-logo.png`, which is the wide
      // banner lockup used on certificates — printed in this letterhead it
      // renders the company's name twice, once as the banner and once as the
      // typeset lockup beside it. The letterhead wants the mark alone.
      logo: await brandMark(),
      issuedOn: new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    },
    { async: true },
  );
}

export async function franchiseeFormPdf(
  labId: number,
  options: FranchiseeFormOptions = {},
): Promise<Buffer> {
  const html = await franchiseeFormHtml(labId, options);
  const { renderHtmlToPdf } = await import('./pdf.service.js');
  return renderHtmlToPdf(html, { format: 'A4' });
}

/* ----------------------------------------------------- franchise agreement */

const AGREEMENT_TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/franchise-agreement.ejs',
);

/**
 * The Franchise Agreement — the four pages that follow the registration form.
 *
 * The paper pack is five sheets: the form somebody fills in, then the offer
 * they are accepting — the equipment a franchise must hold, what is charged
 * for and what is not, the refund position, and the order the establishment
 * runs in. This is those four.
 *
 * Only the header block comes from the record: owner, contact, company, email,
 * address, form number. The rest is the offer, and the offer is the same for
 * every franchise — a laboratory does not get its own equipment list, so it is
 * written in the template rather than kept in a table nobody would ever vary.
 *
 * `blank` prints it with the header empty, for handing across a counter.
 */
/**
 * The band of five stones the agreement prints above its closing line.
 *
 * Lifted from the signed pack itself rather than drawn: it is a photograph,
 * the paper prints it, and an approximation of somebody's letterhead art is
 * the kind of difference a franchise notices when they lay the two sheets
 * side by side.
 *
 * Read once and cached, like the mark: it is on one page of one document.
 */
let diamondBandCache: string | null = null;

/**
 * A picture kept beside the templates, if it is there.
 *
 * Returns null when the file is missing rather than throwing, so a document
 * that wants artwork still prints without it. The alternative — a template
 * that refuses to render because one decorative image was never supplied — is
 * a laboratory unable to print its agreement.
 */
async function templateImage(name: string): Promise<string | null> {
  try {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../templates/${name}`);
    return `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
  } catch {
    return null;
  }
}

async function diamondBand(): Promise<string> {
  if (diamondBandCache) return diamondBandCache;
  const file = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../templates/diamond-band.png',
  );
  const bytes = await readFile(file);
  diamondBandCache = `data:image/png;base64,${bytes.toString('base64')}`;
  return diamondBandCache;
}

export async function franchiseAgreementHtml(
  labId: number,
  options: FranchiseeFormOptions = {},
): Promise<string> {
  const lab = await db
    .selectFrom('users')
    .select(['id', 'empid', 'fullname', 'owner_name', 'mobile', 'email', 'address', 'city', 'state', 'pincode'])
    .where('id', '=', labId)
    .executeTakeFirst();
  if (!lab) throw notFound('Laboratory not found.');

  const company = await Promise.all(
    ['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'website'].map((k) =>
      setting(`company.${k}`),
    ),
  ).then(([name, address, city, state, pincode, phone, email, website]) => ({
    name,
    address,
    city,
    state,
    pincode,
    phone,
    email,
    website,
  }));

  // The same record with the laboratory's own answers removed, as the form
  // does it: one template, so the copy handed over and the copy printed from
  // an account cannot drift apart.
  const printed = options.blank ? ({ id: lab.id } as typeof lab) : lab;

  return ejs.renderFile(
    AGREEMENT_TEMPLATE,
    {
      lab: printed,
      title: lab.fullname ?? '',
      company,
      logo: await brandMark(),
      band: await diamondBand(),
      /*
        The two hands fitting a puzzle together, which the paper prints under
        the establishment diagram. Optional: drop the artwork in as
        `templates/puzzle-hands.png` and it appears; leave it out and the page
        prints without it rather than failing.
      */
      puzzle: await templateImage('puzzle-hands.png'),
      issuedOn: new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    },
    { async: true },
  );
}

export async function franchiseAgreementPdf(
  labId: number,
  options: FranchiseeFormOptions = {},
): Promise<Buffer> {
  const html = await franchiseAgreementHtml(labId, options);
  const { renderHtmlToPdf } = await import('./pdf.service.js');
  return renderHtmlToPdf(html, { format: 'A4' });
}

/* ------------------------------------------------------------ fee statement */

const FEE_TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/fee-statement.ejs',
);

const rupees = (v: number | string | null | undefined) =>
  `₹ ${Number(v ?? 0).toLocaleString('en-IN')}`;

/**
 * The IIGL mark, as a data URI.
 *
 * The cards read their logo out of the Laravel public/ directory, which is
 * fine on a server that has one and leaves a hole in the sheet anywhere that
 * does not — a checkout without the legacy tree, or a host where
 * LEGACY_PUBLIC_ROOT is not set. So the statement prefers that asset and falls
 * back to a copy that ships beside the templates: paperwork that goes to a
 * student should not depend on a directory outside this repository.
 */
/**
 * The round IIGL mark on its own, for a letterhead that sets the company name
 * in type beside it. `brandLogo` below is the certificate's banner lockup and
 * is a different image for a different job.
 */
async function brandMark(): Promise<string> {
  const file = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../templates/iigl-logo.png',
  );
  return `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
}

async function brandLogo(): Promise<string> {
  const legacy = await asDataUri('public/card-logo.png');
  if (legacy) return legacy;

  const file = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../templates/iigl-logo.png',
  );
  return `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
}

/**
 * One enrolment's fee, as a sheet that can be handed over.
 *
 * Every figure is read from the enrolment rather than recomputed: the API is
 * what sets `final_fee` when a discount is applied, so a statement that did
 * its own arithmetic could disagree with the screen the money was taken on.
 * `due` is the one derived number, and it is the same subtraction the payment
 * endpoint answers with.
 */
export async function feeStatementHtml(enrolmentId: number, issuedBy: string): Promise<string> {
  const enrolment = await db
    .selectFrom('student_courses as sc')
    .leftJoin('students as s', 's.id', 'sc.student_id')
    .leftJoin('courses as c', 'c.id', 'sc.course_id')
    .select([
      'sc.id',
      'sc.batch',
      'sc.fee',
      'sc.discount_amount',
      'sc.discount_reason',
      'sc.final_fee',
      'sc.gst_percent',
      'sc.gst_amount',
      'sc.fee_paid',
      's.name as student_name',
      's.registration_no',
      'c.name as course_name',
    ])
    .where('sc.id', '=', enrolmentId)
    .executeTakeFirst();
  if (!enrolment) throw notFound('Enrolment not found.');

  return ejs.renderFile(
    FEE_TEMPLATE,
    {
      enrolment,
      // What is owed: the fee after discount, plus its tax, less what has come
      // in. Zero tax on an enrolment made before 020, so those statements read
      // exactly as they did.
      payable: Number(enrolment.final_fee ?? 0) + Number(enrolment.gst_amount ?? 0),
      due:
        Number(enrolment.final_fee ?? 0) +
        Number(enrolment.gst_amount ?? 0) -
        Number(enrolment.fee_paid ?? 0),
      issuedBy,
      issuedAt: new Date().toLocaleString('en-IN'),
      logo: await brandLogo(),
      money: rupees,
    },
    { async: true },
  );
}

export async function feeStatementPdf(enrolmentId: number, issuedBy: string): Promise<Buffer> {
  const html = await feeStatementHtml(enrolmentId, issuedBy);
  const { renderHtmlToPdf } = await import('./pdf.service.js');
  return renderHtmlToPdf(html, { format: 'A4' });
}
