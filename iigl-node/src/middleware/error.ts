import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'Something went wrong on our side.' });
};
