import { Router } from 'express';
import { wrap } from '../lib/async.js';
import { getObject, getObjectBuffer, publicUrlFor, storageConfigured } from '../lib/storage.js';
export const fileRoutes = Router();
/**
 * Serves an uploaded file.
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
 *
 * **Two ways out, and the fast one is a redirect.** A round trip to R2 from
 * this network measures 0.6–1.8 seconds whatever the file weighs — a
 * zero-byte HEAD costs the same as 200 KB — so proxying meant every avatar on
 * a screen paid that twice over: once from the server to Cloudflare, once from
 * the browser to the server. Where the bucket has a public domain the browser
 * is sent straight there instead, and fetches the rest in parallel from the
 * edge. Without one, the bytes are streamed as before, through the cache
 * below.
 */
fileRoutes.get(/.*/, wrap(async (req, res) => {
    if (!storageConfigured) {
        res.status(404).json({ message: 'Not found.' });
        return;
    }
    const key = `uploads/${decodeURIComponent(req.path).replace(/^\/+/, '')}`;
    const direct = publicUrlFor(key);
    if (direct) {
        // Keys carry a UUID, so this answer can be held as long as the file it
        // points at — the redirect itself is what a browser caches.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.redirect(302, direct);
        return;
    }
    const hit = cached(key);
    if (hit) {
        sendHeaders(res, hit.contentType, hit.body.byteLength);
        res.end(hit.body);
        return;
    }
    // Small enough to keep: read it whole so it can be cached. Anything larger
    // is streamed straight through and never held.
    const object = await getObject(key);
    if (!object) {
        res.status(404).json({ message: 'Not found.' });
        return;
    }
    if ((object.contentLength ?? Infinity) <= MAX_CACHED_BYTES) {
        const body = await getObjectBuffer(key);
        if (body) {
            remember(key, body, object.contentType);
            sendHeaders(res, object.contentType, body.byteLength);
            res.end(body);
            return;
        }
    }
    sendHeaders(res, object.contentType, object.contentLength);
    if (object.etag)
        res.setHeader('ETag', object.etag);
    object.body.pipe(res);
}));
function sendHeaders(res, contentType, contentLength) {
    res.setHeader('Content-Type', contentType);
    // Keys carry a UUID, so an object is never rewritten under the same name.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (contentLength !== undefined)
        res.setHeader('Content-Length', String(contentLength));
}
/* ------------------------------------------------------------------ cache */
/**
 * What has been read from R2 recently, kept in memory.
 *
 * The point is the latency, not the bandwidth: the files themselves are small
 * — 28 KB is the median of what is in the bucket — but each fetch costs the
 * best part of a second before the first byte arrives. Holding the last few
 * hundred turns a second view of the same screen into no round trip at all.
 *
 * Least-recently-used, bounded by total bytes rather than by count, because a
 * count is the wrong bound when entries run from a 4 KB signature to a 2 MB
 * photograph. A `Map` keeps insertion order, so the oldest entry is the first
 * one iteration yields; reading an entry re-inserts it at the back.
 *
 * Nothing here needs invalidating. A stored key contains a UUID and is never
 * written twice, so a cached body cannot go stale — it can only become a file
 * nobody asks for any more, and the eviction handles that.
 */
const MAX_CACHED_BYTES = 2 * 1024 * 1024;
const CACHE_BUDGET = 48 * 1024 * 1024;
const cache = new Map();
let cachedBytes = 0;
function cached(key) {
    const hit = cache.get(key);
    if (!hit)
        return undefined;
    // Re-inserted, so it is now the most recently used.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
}
function remember(key, body, contentType) {
    if (cache.has(key)) {
        cachedBytes -= cache.get(key).body.byteLength;
        cache.delete(key);
    }
    cache.set(key, { body, contentType });
    cachedBytes += body.byteLength;
    while (cachedBytes > CACHE_BUDGET) {
        const oldest = cache.keys().next();
        if (oldest.done)
            break;
        cachedBytes -= cache.get(oldest.value).body.byteLength;
        cache.delete(oldest.value);
    }
}
