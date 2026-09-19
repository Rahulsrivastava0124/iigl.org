/**
 * The two smart cards, and what makes them two.
 *
 *   npm run check:cards
 *
 * `smart` and `smart-header` are one template with a flag, so the thing that
 * can go wrong is the flag: a block that should belong to one card appearing on
 * both, or on neither. That has happened twice already — the header was on the
 * plain card, and then the diamond ground was on neither — and each time it was
 * found by somebody printing a card and looking at it.
 *
 * Every rule below is read off Laravel's two blades rather than off a
 * screenshot:
 *
 *   multsmart.blade.php            no logo, no background, no corner rules,
 *                                  no terms line, and a back panel that is the
 *                                  issuing laboratory's address and nothing else
 *   smartCardwithheader.blade.php  the logo, `bg.png` at 130px on every
 *                                  section, four 15px corner rules, the terms
 *                                  line, and the notes, IIGL block and gold band
 *
 * Both print the customer's name and mark where the order asked for them —
 * that is not what separates them.
 *
 * Read-only: it renders HTML and inspects it, and writes nothing.
 */
import assert from 'node:assert';
import { cardDataFor, loadChrome } from '../services/card.service.js';
import { renderCardsHtml } from '../services/pdf.service.js';
import { db } from '../db/index.js';
import { sql } from 'kysely';

/** A certificate whose order carries a customer's name or mark, if there is one. */
const branded = await sql<{ id: number }>`
  select r.id
    from reports r
    join orders o on o.id = r.order_no
   where (o.show_name_in_card <> 0 or o.show_image_in_card <> 0)
     and r.item_image is not null
   order by r.id desc
   limit 1
`.execute(db);

const id = Number(
  branded.rows[0]?.id ??
    (
      await db
        .selectFrom('reports')
        .select('id')
        .where('item_image', 'is not', null)
        .orderBy('id', 'desc')
        .executeTakeFirstOrThrow()
    ).id,
);

const [cards, chrome] = await Promise.all([cardDataFor([id]), loadChrome()]);
const card = cards[0]!;
const html = {
  smart: await renderCardsHtml('smart', cards, chrome),
  'smart-header': await renderCardsHtml('smart-header', cards, chrome),
};

console.log(`certificate ${card.report_no}`);
console.log(`  customer   ${card.customer_name ?? '—'}${card.customer_image ? ' + mark' : ''}`);
console.log(`  laboratory ${card.lab_address ?? '—'}\n`);

let failed = false;

/** `want` is the kinds the feature must appear on, and only those. */
function only(feature: string, want: Array<keyof typeof html>, present: (h: string) => boolean) {
  const on = (Object.keys(html) as Array<keyof typeof html>).filter((k) => present(html[k]));
  const ok = on.length === want.length && want.every((k) => on.includes(k));
  if (!ok) failed = true;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${feature.padEnd(34)} on: ${on.join(', ') || 'neither'}${
      ok ? '' : `   (wanted: ${want.join(', ') || 'neither'})`
    }`,
  );
}

console.log('what the headed card has and the plain one does not:');
only('IIGL logo', ['smart-header'], (h) => h.includes('class="logo"'));
only('diamond ground', ['smart-header'], (h) => h.includes('background-image:url'));
only('corner trim rules', ['smart-header'], (h) => h.includes('class="corners"'));
only('terms line', ['smart-header'], (h) => h.includes('For Term &amp; Condition'));
only('Important Information', ['smart-header'], (h) => h.includes('Important Information'));
only('gold band', ['smart-header'], (h) => h.includes('Giving an Identity of Pureness'));

console.log('\nwhat both carry:');
only('the certificate number', ['smart', 'smart-header'], (h) => h.includes(card.report_no));
only('the stone', ['smart', 'smart-header'], (h) => h.includes('class="item"'));
only('the QR', ['smart', 'smart-header'], (h) => h.includes('class="qr"'));
only("the laboratory's address", ['smart', 'smart-header'], (h) =>
  card.lab_address ? h.includes(card.lab_address) : true,
);
if (card.customer_name) {
  only('the customer’s name', ['smart', 'smart-header'], (h) => h.includes(card.customer_name!));
}

/*
  The back block, which had head office's address baked into the image on every
  laboratory's card until `2.png` replaced it.
*/
console.log('\nthe back block:');
const headed = html['smart-header'];
const usesBlock = chrome.backBlock !== null && headed.includes(chrome.backBlock.slice(0, 64));
const usesOldLogo = chrome.backLogo !== null && headed.includes(chrome.backLogo.slice(0, 64));
if (!usesBlock || usesOldLogo) {
  failed = true;
  console.log(`  FAIL  the headed card must use 2.png, not back-logo.png`);
} else {
  console.log(`  ok    2.png, with the laboratory's address over it`);
}

assert.ok(!failed, 'the two smart cards are not what the blades say they are');
console.log('\nBoth cards are what their blade says they are.');

await db.destroy();
process.exit(0);
