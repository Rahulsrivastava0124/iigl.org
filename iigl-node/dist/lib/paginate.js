/**
 * Reads ?page and ?per_page. Capped because the PHP loads all 21,318 report
 * rows unpaginated in several places.
 */
export function readPage(req, defaultPerPage = 50, maxPerPage = 200) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(maxPerPage, Math.max(1, Number(req.query.per_page) || defaultPerPage));
    return { limit: perPage, offset: (page - 1) * perPage, page };
}
export function paged(rows, total, p) {
    return {
        data: rows,
        meta: {
            page: p.page,
            per_page: p.limit,
            total,
            total_pages: Math.ceil(total / p.limit),
        },
    };
}
/**
 * Reads `?q` and turns it into a predicate matching any of the given columns.
 *
 * Returns null when no term was sent, so a caller can skip the clause entirely
 * rather than adding an always-true one.
 *
 * `%` and `_` in the term are escaped: someone searching for a literal "100%"
 * means those four characters, not "100 followed by anything". Kysely
 * parameterises the value itself, so the escaping is about the search being
 * right, not about injection.
 *
 * The database collation is `utf8mb4_0900_ai_ci`, so LIKE already ignores case
 * and accents — lowering either side here would only defeat an index.
 */
export function readSearch(req, columns) {
    const term = String(req.query.q ?? '').trim();
    if (!term)
        return null;
    const like = `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    return (eb) => eb.or(columns.map((column) => eb(column, 'like', like)));
}
