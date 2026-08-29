import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import puppeteer from 'puppeteer';
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
const TEMPLATES = {
    smart: path.join(TEMPLATE_DIR, 'smart-card.ejs'),
    classic: path.join(TEMPLATE_DIR, 'classic-card.ejs'),
};
/** Page setup per card type. Sizes match the printed stock. */
const PAGE = {
    smart: { width: '7.2in', height: '2.5in' },
    classic: { format: 'A4' },
};
let browserPromise = null;
async function getBrowser() {
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
export async function closeBrowser() {
    if (!browserPromise)
        return;
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    await browser?.close().catch(() => undefined);
}
/**
 * Renders arbitrary HTML to PDF on the shared browser. Used by the order
 * paperwork, which is the same job as a card with a different page size.
 */
export async function renderHtmlToPdf(html, page) {
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
    }
    finally {
        await tab.close().catch(() => undefined);
    }
}
export async function renderCardsHtml(kind, cards, chrome) {
    return ejs.renderFile(TEMPLATES[kind], { cards, chrome }, { async: true });
}
export async function renderCardsPdf(kind, cards, chrome) {
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
    }
    finally {
        await page.close().catch(() => undefined);
    }
}
