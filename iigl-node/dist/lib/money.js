/**
 * Money and weight arithmetic, kept apart from the database so it can be tested
 * on its own. Both rules below are carried over from the Laravel application
 * exactly; changing either silently changes what customers are billed.
 */
/** GST rate applied to every order. */
export const GST_MULTIPLIER = 118 / 100;
export const round2 = (n) => Math.round(n * 100) / 100;
/**
 * Adds 18% GST, truncating rather than rounding.
 *
 * The original does `parseInt((total - discount) * 118 / 100)`, so 778.8 is
 * billed as 778 and not 779. Rounding instead would overcharge by a rupee on
 * most orders.
 *
 * The rate is not configurable. GST rates are a master list — Master › GST —
 * recorded against a course fee or a price band; what an order is billed stays
 * the ported 18% that PARITY.md verified.
 */
export function gstOf(payable) {
    return Math.trunc(payable * GST_MULTIPLIER);
}
/**
 * Reads a carat weight from the varchar column it is stored in.
 *
 * The live data is not all numeric — `8..00`, `2.276 gm / 0.22` and
 * `2.10carat \ 2.31` are all real values. MySQL compares such strings by their
 * leading numeric prefix, so the PHP priced them off that prefix. `parseFloat`
 * reproduces exactly that, where `Number` would return NaN and drop the
 * certificate into the lowest price band.
 */
export function caratOf(raw) {
    const n = parseFloat(String(raw ?? '').trim());
    return Number.isFinite(n) ? n : 0;
}
