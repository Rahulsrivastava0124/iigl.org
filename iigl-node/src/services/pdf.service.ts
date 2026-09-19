import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import puppeteer, { type Browser } from 'puppeteer';
import type { CardChrome, CardData } from './card.service.js';

/**
 * Renders certificate cards to PDF.
 *
 * Puppeteer prints the same HTML and CSS the Laravel views produced, which is
 * the only approach that preserves the printed layout without redrawing it.
 * Cards are legal documents already in circulation, so visual drift is a
 * defect rather than a preference.
 *
 * One browser is shared across requests and launched on first use. Starting
 * Chromium costs a second or so, and paying that per certificate would make
 * batch printing unusable.
 */

const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates');

/**
 * The three cards this laboratory prints.
 *
 *   smart          the small card, IIGL's logo alone
 *   smart-header   the same card carrying the customer's own name and mark
 *   classic        the A4 identification report
 *
 * The first two are Laravel's `smart.blade.php` and
 * `smartCardwithheader.blade.php`, which were two files that shared everything
 * but a block. They are one template here with a flag, because two copies of a
 * card drift: a correction made to the certificate rows of one would sooner or
 * later not be in the other, and nobody would notice until a customer held
 * both.
 */
export type CardKind = 'smart' | 'smart-header' | 'classic';

const TEMPLATES: Record<CardKind, string> = {
  smart: path.join(TEMPLATE_DIR, 'smart-card.ejs'),
  'smart-header': path.join(TEMPLATE_DIR, 'smart-card.ejs'),
  classic: path.join(TEMPLATE_DIR, 'classic-card.ejs'),
};

/** Page setup per card type. Sizes match the printed stock. */
const PAGE: Record<CardKind, { width: string; height: string } | { format: 'A4' }> = {
  smart: { width: '7.2in', height: '2.5in' },
  'smart-header': { width: '7.2in', height: '2.5in' },
  classic: { format: 'A4' },
};

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    // A crashed browser must not be handed out again.
    const browser = await browserPromise;
    browser.on('disconnected', () => {
      browserPromise = null;
    });
    return browser;
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => undefined);
}

/**
 * Renders arbitrary HTML to PDF on the shared browser. Used by the order
 * paperwork, which is the same job as a card with a different page size.
 */
export async function renderHtmlToPdf(
  html: string,
  page: { width: string; height: string } | { format: 'A4' },
): Promise<Buffer> {
  const browser = await getBrowser();
  const tab = await browser.newPage();
  try {
    await tab.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    const pdf = await tab.pdf({
      ...page,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await tab.close().catch(() => undefined);
  }
}

export async function renderCardsHtml(
  kind: CardKind,
  cards: CardData[],
  chrome: CardChrome,
): Promise<string> {
  // `header` is what separates the two smart cards; the classic template
  // ignores it.
  return ejs.renderFile(
    TEMPLATES[kind],
    { cards, chrome, header: kind === 'smart-header' },
    { async: true },
  );
}

export async function renderCardsPdf(
  kind: CardKind,
  cards: CardData[],
  chrome: CardChrome,
): Promise<Buffer> {
  const html = await renderCardsHtml(kind, cards, chrome);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Every asset is already a data URI, so nothing is fetched over the
    // network and 'load' resolves as soon as the images decode.
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });

    const pdf = await page.pdf({
      ...PAGE[kind],
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}
