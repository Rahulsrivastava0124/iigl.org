/**
 * Printing, without leaving the page.
 *
 * The panel has no print stylesheet and no print route: what needs printing is
 * one small document at a time — a fee receipt today — and printing the whole
 * screen would carry the sidebar and the table with it.
 *
 * So the document is written into a hidden iframe and that iframe is printed.
 * `window.open` was the other option and is worse: a pop-up blocker eats it,
 * and when it does not, the person is left with a stray tab to close.
 */

/** Escapes text that is about to be dropped into the document. */
export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The house paper: navy heading, a hairline rule, tabular figures.
 *
 * Kept here rather than in each caller so two printed documents cannot drift
 * into two different letterheads.
 */
const STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 28px 32px;
    font: 13px/1.6 "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #3c4252;
  }
  h1 { margin: 0; font-size: 17px; font-weight: 600; color: #061948; letter-spacing: 0.01em; }
  .sub { margin: 2px 0 0; font-size: 11.5px; color: #4a5265; }
  .rule { height: 1px; background: #e6e8ee; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 0; vertical-align: top; }
  td.k { color: #4a5265; }
  td.v { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { padding-top: 10px; border-top: 1px solid #e6e8ee; font-weight: 600; color: #061948; }
  .note { margin-top: 22px; font-size: 11px; color: #4a5265; }
  @page { margin: 14mm; }
`;

/**
 * Print one document.
 *
 * Returns once the print dialog has been asked for; the iframe is cleaned up
 * after, on a timer rather than on `afterprint`, which Safari does not fire
 * when the dialog is dismissed.
 */
export function printDocument(title: string, bodyHtml: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${STYLES}</style></head><body>${bodyHtml}</body></html>`,
  );
  doc.close();

  frame.contentWindow?.focus();
  frame.contentWindow?.print();

  window.setTimeout(() => frame.remove(), 1000);
}
