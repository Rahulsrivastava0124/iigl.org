import { Router } from 'express';
import { wrap } from '../lib/async.js';
import { getObject, storageConfigured } from '../lib/storage.js';

export const fileRoutes = Router();

/**
 * Serves an uploaded file out of R2.
 *
 * Mounted behind the legacy static directory at `/api/files`, so it only ever
 * sees requests for files that are not on disk — which, after the move to R2,
 * is everything newly uploaded. A miss in both places is a plain 404: the
 * database can point at a file somebody deleted, and that is not an error
 * worth a stack trace.
 *
 * The key is the request path under `uploads/`, matching how the object was
 * written. `..` cannot survive Express's path parsing, and the bucket holds
 * nothing but uploads in any case.
 */
fileRoutes.get(
  /.*/,
  wrap(async (req, res) => {
    if (!storageConfigured) {
      res.status(404).json({ message: 'Not found.' });
      return;
    }

    const key = `uploads/${decodeURIComponent(req.path).replace(/^\/+/, '')}`;
    const object = await getObject(key);

    if (!object) {
      res.status(404).json({ message: 'Not found.' });
      return;
    }

    res.setHeader('Content-Type', object.contentType);
    // Keys carry a UUID, so an object is never rewritten under the same name.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (object.contentLength !== undefined) {
      res.setHeader('Content-Length', String(object.contentLength));
    }
    if (object.etag) res.setHeader('ETag', object.etag);

    object.body.pipe(res);
  }),
);
