import type { RequestHandler } from 'express';
import { badRequest } from '../lib/errors.js';

/**
 * Rejects a path parameter that is not a positive integer, before it reaches a
 * query.
 *
 * Without this, `Number('abc')` produces NaN, MySQL is asked for
 * `WHERE id = NaN` and answers `Unknown column 'NaN' in 'where clause'`, which
 * surfaces to the caller as a 500. A bad id in a URL is the caller's mistake,
 * so it deserves a 400 and a message naming the parameter.
 */
export const numericParams =
  (...names: string[]): RequestHandler =>
  (req, _res, next) => {
    for (const name of names) {
      const raw = req.params[name];
      if (raw === undefined) continue;
      // Express types a param as string | string[]; a repeated segment is not an id.
      if (typeof raw !== 'string') {
        return next(badRequest(`${name} must be a positive whole number.`));
      }

      // Number() accepts '', ' ', '0x1f' and '1e3'; none of those are ids.
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
        return next(badRequest(`${name} must be a positive whole number.`));
      }
    }
    next();
  };

/** The common case: a single `:id` segment. */
export const numericId = numericParams('id');
