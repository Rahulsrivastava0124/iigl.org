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
import { ledgerFor, type LedgerScope } from './commission.service.js';
import { letterheadHtml } from './letterhead.service.js';

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

/** The receipt, laid out as the Laravel one printed. The invoice keeps TEMPLATE. */
const RECEIPT_TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/order-receipt.ejs',
);

/** `03/09/2026` — the Laravel receipt's `date('d/m/Y')`, without a time-zone shift. */
const dmy = (v: Date | string | null | undefined) => {
  if (!v) return '';
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(v.getDate())}/${p(v.getMonth() + 1)}/${v.getFullYear()}`;
  }
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
};

export type DocumentKind = 'receipt' | 'invoice';

const money = (v: number | string | null | undefined) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('en-IN');

export async function orderDocumentHtml(orderId: number, kind: DocumentKind): Promise<string> {
  const order = await db
    .selectFrom('orders')
    .where('deleted_at', 'is', null)
    .selectAll()
    .where('id', '=', orderId)
    .executeTakeFirst();
  if (!order) throw notFound('Order not found.');

  const [items, lab, categories] = await Promise.all([
    db.selectFrom('order_details').selectAll().where('order_id', '=', orderId).execute(),
    db
      .selectFrom('users')
      .select([
        'id', 'fullname', 'address', 'city', 'state', 'pincode', 'mobile', 'gst_no', 'signature',
        // The receipt's header line: address · city · state · country · pincode,
        // and both numbers after Tel.
        'country', 'alt_mobile',
        // The laboratory block on the invoice: its own contacts, PAN and bank.
        'office_tel', 'fax', 'email', 'official_email', 'pan_no',
        'bank_name', 'bank_branch', 'ifsc_code', 'account_no', 'account_holder',
      ])
      .where('id', '=', Number(order.lab_id))
      .executeTakeFirst(),
    db.selectFrom('categories').select(['id', 'name']).execute(),
  ]);

  const categoryName = new Map(categories.map((c) => [Number(c.id), c.name]));

  /*
    The receipt: what was taken in, and the terms it was taken in on, laid out
    as the Laravel receipt printed. No prices — nothing is priced until the
    certificates exist — so none of the invoice's work below is needed.
  */
  if (kind === 'receipt') {
    return ejs.renderFile(
      RECEIPT_TEMPLATE,
      {
        order,
        lab,
        // The wide IIGL lockup — round mark, rule, two-line name — which is the
        // old receipt's `public/card-logo.png`, as the certificate cards use it.
        logo: await asDataUri('public/card-logo.png'),
        receiptDate: dmy(order.created_at as Date | string | null),
        totalQty: items.reduce((n, it) => n + (Number(it.qty) || 0), 0),
        items: items.map((it) => ({
          ...it,
          category_name: categoryName.get(Number(it.category_id)) ?? null,
        })),
      },
      { async: true },
    );
  }

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
  // The second page of the invoice: one row per certificate on the order.
  let reportLines: {
    report_no: string;
    description: string;
    gross_weight: string | null;
    carat_weight: string | null;
    smart: number;
    classic: number;
  }[] = [];

  if (kind === 'invoice') {
    const quote = await quoteOrder(orderId, Number(order.discount ?? 0));
    const detailOf = new Map<number, number>();
    const certByReport = new Map(quote.certificates.map((c) => [c.report_id, c]));
    for (const c of quote.certificates) detailOf.set(c.report_id, c.line_total);

    // Group certificate totals back onto the order line each belongs to, and
    // carry each certificate's own row for the Report Details page.
    const reports = await db
      .selectFrom('reports')
      .select(['id', 'order_detail_id', 'report_no', 'gross_weight', 'carat_weight', 'comments'])
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

    reportLines = reports.map((r) => {
      const c = certByReport.get(Number(r.id));
      return {
        report_no: r.report_no,
        description: r.comments ?? '',
        gross_weight: r.gross_weight,
        carat_weight: r.carat_weight,
        smart: Number(c?.smart_price ?? 0),
        classic: Number(c?.classic_price ?? 0),
      };
    });

    totals = {
      total_amount: quote.total_amount,
      discount: quote.discount,
      payable_amount: quote.payable_amount,
      amount_with_gst: quote.amount_with_gst,
      // From the quote, not from the order's columns: those hold what the last
      // settlement wrote, and an order paid in parts has had several. The
      // quote sums the collections themselves, so the invoice cannot disagree
      // with the payment history it is printed from.
      paid: quote.paid_amount,
      dues: quote.balance_due,
    };
  }

  const [signature, letterhead, companyName, companyLogo] = await Promise.all([
    asDataUri(lab?.signature ?? null),
    letterheadHtml(),
    setting('company.name'),
    brandMark(),
  ]);

  return ejs.renderFile(
    TEMPLATE,
    {
      kind,
      order,
      lab,
      signature,
      letterhead,
      totals,
      reportLines,
      company: { name: companyName || 'Institute of International Gemological Laboratory', logo: companyLogo },
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
      // The round mark.
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
 * The round IIGL mark on its own, for a letterhead that sets the company name
 * in type beside it.
 */
async function brandMark(): Promise<string> {
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
      letterhead: await letterheadHtml(),
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


/* ---------------------------------------------------- course certificate */

const COURSE_CERTIFICATE_TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/course-certificate.ejs',
);

export type CertificateOrientation = 'landscape' | 'portrait';

/**
 * One course certificate, printed on the artwork its course carries.
 *
 * The design belongs to the course rather than to the certificate: every
 * student finishing the same course takes away the same sheet with a different
 * name on it, so the file lives on `courses.certificate_template` and this lays
 * five fields over it.
 *
 * **A course with no artwork does not print.** The alternative is inventing a
 * layout, and a certificate is a document somebody keeps and shows to an
 * employer — handing over something head office never approved is worse than a
 * refusal naming what is missing.
 *
 * The artwork becomes a data URI rather than a URL. Puppeteer is given the HTML
 * directly and has no origin to resolve a relative path against, and a file
 * fetched over the network would make printing depend on object storage being
 * reachable at that moment.
 */
export async function courseCertificateHtml(
  certificateId: number,
  orientation: CertificateOrientation = 'landscape',
): Promise<string> {
  const certificate = await db
    .selectFrom('student_certificates as cert')
    .leftJoin('students as s', 's.id', 'cert.student_id')
    .leftJoin('student_courses as sc', 'sc.id', 'cert.student_course_id')
    .leftJoin('courses as c', 'c.id', 'sc.course_id')
    .select([
      'cert.certificate_no',
      'cert.issued_on',
      'cert.grade',
      's.name as student_name',
      's.registration_no',
      'c.name as course_name',
      'c.certificate_template',
    ])
    .where('cert.id', '=', certificateId)
    .executeTakeFirst();
  if (!certificate) throw notFound('Certificate not found.');

  const artwork = await asDataUri(certificate.certificate_template);
  if (!artwork) {
    throw notFound(
      `No certificate design has been uploaded for ${certificate.course_name ?? 'this course'}. ` +
        'Add one on the course, then print.',
    );
  }

  return ejs.renderFile(
    COURSE_CERTIFICATE_TEMPLATE,
    {
      certificate,
      artwork,
      orientation,
      // Printed the way a certificate reads rather than the way a database
      // sorts: 4 March 2026, not 2026-03-04.
      issuedOn: certificate.issued_on
        ? new Date(certificate.issued_on).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : null,
    },
    { async: true },
  );
}

export async function courseCertificatePdf(
  certificateId: number,
  orientation: CertificateOrientation = 'landscape',
): Promise<Buffer> {
  const html = await courseCertificateHtml(certificateId, orientation);
  const { renderHtmlToPdf } = await import('./pdf.service.js');
  // The size in the template's @page rule wins over this, which is what carries
  // the orientation through; A4 here is the fallback if that rule is ever lost.
  return renderHtmlToPdf(html, { format: 'A4' });
}


/* --------------------------------------------------------------- payslip */

const PAYSLIP_TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/payslip.ejs',
);

/**
 * One employee's payslip for one month.
 *
 * Built from the payments themselves rather than from the arithmetic: a slip is
 * a receipt for money that changed hands, and the salary screen's pro-rata
 * figure is a suggestion nobody has yet agreed to. A month with no payment
 * still renders — it says so, which is the answer to "have I been paid".
 *
 * The days and the monthly salary come from the payment rows, not from today's
 * attendance: correcting a punch next week must not change a slip already
 * handed over.
 */
export async function payslipHtml(empId: number, month: string): Promise<string> {
  const employee = await db
    .selectFrom('users')
    .select(['id', 'fullname', 'empid', 'mobile'])
    .where('id', '=', empId)
    .executeTakeFirst();
  if (!employee) throw notFound('Employee not found.');

  const posting = await db
    .selectFrom('employements')
    .select(['salary', 'parent_id'])
    .where('user_id', '=', empId)
    .where('is_working', '=', '1')
    .executeTakeFirst();

  const employer = posting?.parent_id
    ? await db
        .selectFrom('users')
        .select(['id', 'fullname', 'city'])
        .where('empid', '=', posting.parent_id)
        .executeTakeFirst()
    : undefined;

  const payments = await db
    .selectFrom('salary_payments')
    .select(['amount', 'paid_on', 'pay_mode', 'reference', 'note', 'days_present', 'salary_month'])
    .where('emp_id', '=', empId)
    .where('month', '=', month)
    .orderBy('id')
    .execute();

  const [year, mm] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mm, 0).getDate();

  return ejs.renderFile(PAYSLIP_TEMPLATE, {
    employee,
    employer: employer ?? { fullname: 'IIGL', city: null },
    month,
    payments,
    daysInMonth,
    // What the payments recorded, falling back to the employment for a month
    // nothing has been paid against yet.
    daysPresent: payments[0]?.days_present ?? 0,
    salary: payments[0]?.salary_month ?? posting?.salary ?? 0,
    letterhead: await letterheadHtml(),
  });
}

export async function payslipPdf(empId: number, month: string): Promise<Buffer> {
  const html = await payslipHtml(empId, month);
  const { renderHtmlToPdf } = await import('./pdf.service.js');
  return renderHtmlToPdf(html, { format: 'A4' });
}

/* ----------------------------------------------------- account statement */

const ACCOUNT_STATEMENT_TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/account-statement.ejs',
);

/**
 * One wallet over a period, as a sheet to keep.
 *
 * The same ledger the Wallet screen reads — the same scope, the same opening
 * balance folded from everything before the period — with every row in the
 * period rather than a page of them. A statement that stopped at fifty rows
 * would total to a figure the rows on it do not add up to.
 */
export type StatementFilter = { status: number | null; q: string | null; mode: string | null };

export async function accountStatementHtml(
  userId: number,
  scope: LedgerScope,
  period: { from: string | null; to: string | null },
  issuedBy: string,
  filter: StatementFilter = { status: null, q: null, mode: null },
): Promise<string> {
  const holder = await db
    .selectFrom('users')
    .select(['id', 'fullname', 'empid'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!holder) throw notFound('Account not found.');

  /*
    The statement is the list as it is filtered on screen — status, reference and
    way of paying as well as wallet and dates.

    Filtered, it cannot also claim that opening plus credit less debit is the
    closing balance: the rows left out moved the balance too. So a filtered
    sheet totals what it prints — the approved credit and debit among the listed
    rows — keeps opening and closing as the account's real balances for the
    period, and drops the line promising
    that the figures reconcile.
  */
  const page = await ledgerFor(userId, Number.MAX_SAFE_INTEGER, 0, scope, period, filter);
  const filtered = filter.status !== null || !!filter.q || !!filter.mode;

  const listed = { credit: 0, debit: 0 };
  for (const e of page.entries) {
    if (e.status !== 1) continue;
    if (e.direction === 'credit') listed.credit += e.amount;
    else listed.debit += e.amount;
  }


  const letterhead = await letterheadHtml();

  return ejs.renderFile(
    ACCOUNT_STATEMENT_TEMPLATE,
    {
      holder,
      page,
      // Oldest first on paper: read down the page the way the balance was built.
      lines: [...page.entries].reverse(),
      from: period.from,
      to: period.to,
      filtered,
      listedCredit: Math.round(listed.credit * 100) / 100,
      listedDebit: Math.round(listed.debit * 100) / 100,
      walletLabel:
        scope === 'expense' ? 'Expense wallet statement' : scope === 'collection' ? 'Wallet statement' : 'Account statement',
      issuedBy,
      issuedOn: new Date().toISOString().slice(0, 10),
      letterhead,
    },
    { async: true },
  );
}

export async function accountStatementPdf(
  userId: number,
  scope: LedgerScope,
  period: { from: string | null; to: string | null },
  issuedBy: string,
  filter: StatementFilter = { status: null, q: null, mode: null },
): Promise<Buffer> {
  const html = await accountStatementHtml(userId, scope, period, issuedBy, filter);
  const { renderHtmlToPdf } = await import('./pdf.service.js');
  return renderHtmlToPdf(html, { format: 'A4' });
}
