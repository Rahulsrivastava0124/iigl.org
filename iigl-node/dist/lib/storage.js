import { GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client, } from '@aws-sdk/client-s3';
import { env } from './env.js';
/**
 * Cloudflare R2, spoken to over its S3-compatible API.
 *
 * R2 has one endpoint per account and ignores regions, so `region` is the
 * fixed literal `auto` that Cloudflare documents; anything else is accepted
 * and meaningless. The client is built once and shared.
 *
 * Missing credentials are not an error here. The application still runs
 * without object storage — it simply has none — so the client is null and
 * every caller can see that from `storageConfigured` rather than discovering
 * it when the first upload throws.
 */
const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = env.r2;
export const storageConfigured = Boolean(accountId && accessKeyId && secretAccessKey && bucket);
export const r2Endpoint = accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '';
export const r2 = storageConfigured
    ? new S3Client({
        region: 'auto',
        endpoint: r2Endpoint,
        credentials: { accessKeyId, secretAccessKey },
    })
    : null;
export const r2Bucket = bucket;
/** Public URL an object is served from, or '' when no public domain is set. */
export function publicUrlFor(key) {
    if (!publicUrl)
        return '';
    return `${publicUrl}/${key.replace(/^\/+/, '')}`;
}
/**
 * One HEAD against the bucket, used at startup to say whether the configured
 * credentials actually reach it. Answering this at boot rather than on the
 * first upload is the point: a wrong key or a bucket in another account is
 * then visible in the startup line instead of in a user's failed upload.
 */
export async function checkStorage() {
    if (!r2)
        return { ok: false, reason: 'not configured' };
    try {
        await r2.send(new HeadBucketCommand({ Bucket: bucket }));
        return { ok: true, bucket, endpoint: r2Endpoint };
    }
    catch (err) {
        const e = err;
        const status = e.$metadata?.httpStatusCode;
        const detail = e.name && e.name !== 'Error' ? e.name : (e.message ?? 'unknown error');
        return { ok: false, reason: status ? `${detail} (HTTP ${status})` : detail };
    }
}
/**
 * Stores one object and returns its key.
 *
 * `cacheSeconds` is long on purpose: every key contains a UUID, so an object is
 * never rewritten under the same name and the browser can hold it forever.
 */
export async function putObject(key, body, contentType, cacheSeconds = 31_536_000) {
    if (!r2)
        throw new Error('Object storage is not configured (R2_* environment variables).');
    await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: `public, max-age=${cacheSeconds}, immutable`,
    }));
    return key;
}
/**
 * Fetches an object for streaming back to a browser, or null when it is not
 * there. A missing object is an ordinary outcome — the file may predate R2 and
 * still be on the legacy disk — so it is not an exception.
 */
export async function getObject(key) {
    if (!r2)
        return null;
    try {
        const out = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!out.Body)
            return null;
        return {
            body: out.Body,
            contentType: out.ContentType ?? 'application/octet-stream',
            contentLength: out.ContentLength,
            etag: out.ETag,
        };
    }
    catch {
        return null;
    }
}
/** The bytes of an object, or null when it is not there. */
export async function getObjectBuffer(key) {
    if (!r2)
        return null;
    try {
        const out = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!out.Body)
            return null;
        return Buffer.from(await out.Body.transformToByteArray());
    }
    catch {
        return null;
    }
}
export async function objectExists(key) {
    if (!r2)
        return false;
    try {
        await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    }
    catch {
        return false;
    }
}
