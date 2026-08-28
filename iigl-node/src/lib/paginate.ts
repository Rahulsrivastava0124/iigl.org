import type { Request } from 'express';

export interface Page {
  limit: number;
  offset: number;
  page: number;
}

/**
 * Reads ?page and ?per_page. Capped because the PHP loads all 21,318 report
 * rows unpaginated in several places.
 */
export function readPage(req: Request, defaultPerPage = 50, maxPerPage = 200): Page {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(maxPerPage, Math.max(1, Number(req.query.per_page) || defaultPerPage));
  return { limit: perPage, offset: (page - 1) * perPage, page };
}

export function paged<T>(rows: T[], total: number, p: Page) {
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
