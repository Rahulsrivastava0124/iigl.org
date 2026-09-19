/**
 * Serves rendered card HTML so a card can be looked at in a browser.
 *
 * `?format=html` on the card routes needs a session; this does not, because it
 * renders straight from the service. It is a development tool for working on
 * the card layouts — the two templates are print artefacts, and the only
 * honest way to change one is to look at it.
 *
 *   npm run cards:preview            the newest certificate
 *   npm run cards:preview -- 22122   a particular one
 *
 * Then open http://localhost:5190/smart or /classic.
 */
import http from 'node:http';

const PORT = 5190;
const { cardDataFor, loadChrome } = await import('../src/services/card.service.ts');
const { renderCardsHtml } = await import('../src/services/pdf.service.ts');
const { db } = await import('../src/db/index.ts');

const asked = Number(process.argv[2]);
const chosen = Number.isFinite(asked) && asked > 0
  ? asked
  : Number(
      (
        await db
          .selectFrom('reports')
          .select('id')
          .where('item_image', 'is not', null)
          .orderBy('id', 'desc')
          .executeTakeFirstOrThrow()
      ).id,
    );

http
  .createServer(async (req, res) => {
    const kind = req.url?.replace(/^\/|\?.*$/g, '') || 'smart';
    if (kind !== 'smart' && kind !== 'classic') {
      res.writeHead(404).end('Try /smart or /classic');
      return;
    }
    try {
      const [cards, chrome] = await Promise.all([cardDataFor([chosen]), loadChrome()]);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(await renderCardsHtml(kind, cards, chrome));
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  })
  .listen(PORT, () => {
    console.log(`card preview for certificate ${chosen}: http://localhost:${PORT}/smart and /classic`);
  });
