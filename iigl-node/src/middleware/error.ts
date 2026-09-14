import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';
import { env } from '../lib/env.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
};

/** `[2026-09-14T12:00:00.000Z] POST /api/messages user=26` — which request, and whose. */
const context = (req: Request) =>
  `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} user=${req.user?.id ?? '-'}`;

/**
 * Every error a request can raise ends here, and every one gets an answer.
 *
 * Nothing thrown by a route takes the server down: it is logged and the client
 * is told, and the next request is served as though nothing happened. What the
 * client is told depends on whose fault it was.
 *
 *   ApiError          the route said what was wrong — its status and sentence.
 *   bad JSON / large  the request itself was malformed — 400 or 413, in words,
 *                     rather than a 500 that blames the server for it.
 *   anything else     a fault here — 500, with a short reference.
 *
 * **The reference** is printed on the log line and returned in the response,
 * so "it said ref 3f9a1c2e" finds the stack trace in the log at once. Outside
 * production the response also carries the error's own message, so a developer
 * reading the network tab sees the cause without opening the terminal. In
 * production it does not: a database error's text can name tables and columns.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const e = err as Error & { status?: number; statusCode?: number; type?: string; code?: string; expose?: boolean };

  // A response already on its way (a PDF half-sent) cannot be replaced by an
  // error body. Log it, and let Express close that one connection.
  if (res.headersSent) {
    console.error(`${context(req)} failed after the response started:`, e);
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    // A 5xx ApiError is still the server's fault, and worth the log line.
    if (err.status >= 500) console.error(`${context(req)} ${err.status} ${err.message}`);
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }

  // The request body could not be read: body-parser marks these with a type.
  if (e.type === 'entity.parse.failed') {
    console.warn(`${context(req)} 400 malformed JSON body`);
    res.status(400).json({ error: 'bad_request', message: 'The request body is not valid JSON.' });
    return;
  }
  if (e.type === 'entity.too.large' || e.code === 'LIMIT_FILE_SIZE') {
    console.warn(`${context(req)} 413 ${e.message}`);
    res.status(413).json({ error: 'too_large', message: 'That is too large to accept.' });
    return;
  }
  // Multer's other refusals — too many files, an unexpected field — are the
  // request's fault too.
  if (e.name === 'MulterError') {
    console.warn(`${context(req)} 400 ${e.message}`);
    res.status(400).json({ error: 'bad_request', message: e.message });
    return;
  }
  // Any other client error a library marked as safe to show.
  const status = e.status ?? e.statusCode;
  if (status && status >= 400 && status < 500 && e.expose) {
    console.warn(`${context(req)} ${status} ${e.message}`);
    res.status(status).json({ error: 'bad_request', message: e.message });
    return;
  }

  const ref = randomUUID().slice(0, 8);
  console.error(`${context(req)} 500 ref=${ref}`);
  console.error(err);
  res.status(500).json({
    error: 'internal',
    message: 'Something went wrong on our side.',
    ref,
    ...(env.isProd ? {} : { detail: e?.message ?? String(err) }),
  });
};
