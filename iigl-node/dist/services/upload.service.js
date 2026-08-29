import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { badRequest } from '../lib/errors.js';
import { env } from '../lib/env.js';
/**
 * File uploads.
 *
 * Files are written into the same directories the Laravel application used and
 * stored in the database as the same `public/uploads/...` paths, so a record
 * written here and a record written by the old system are indistinguishable.
 * That matters while both run against one database: a certificate issued in the
 * new system has to render in the old one and the other way round.
 *
 * The Laravel naming scheme was `time() . 'main.' . extension`, which collides
 * whenever two uploads land in the same second. New files get a UUID instead.
 * Existing paths are untouched.
 */
/** The upload directories in use, and what each holds. */
export const BUCKETS = {
    report: 'uploads/report',
    order: 'uploads/order',
    signature: 'uploads/signature',
    employee: 'uploads/employee',
    banner: 'uploads/banner',
    icon: 'uploads/icon',
    website: 'uploads/website',
    documentation: 'uploads/documentation',
    /** Payment proof. Laravel writes these to public/screenshots, not uploads/. */
    screenshot: 'screenshots',
};
export const isBucket = (v) => v in BUCKETS;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const DOCUMENT_TYPES = new Set([...IMAGE_TYPES, 'application/pdf']);
/** Documentation may be a PDF; everything else is an image. */
const allowedFor = (bucket) => bucket === 'documentation' ? DOCUMENT_TYPES : IMAGE_TYPES;
const EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
};
const MAX_BYTES = 8 * 1024 * 1024;
export function absoluteDir(bucket) {
    return path.resolve(env.legacyPublicRoot, BUCKETS[bucket]);
}
/**
 * The path stored in the database. Laravel prefixes `public/`, and every
 * reader — including the certificate renderer — strips that prefix back off,
 * so new rows keep the convention rather than becoming a second format.
 */
export function storedPath(bucket, filename) {
    return `public/${BUCKETS[bucket]}/${filename}`;
}
export const upload = multer({
    storage: multer.diskStorage({
        destination(req, _file, cb) {
            const bucket = String(req.params.bucket);
            if (!isBucket(bucket))
                return cb(badRequest('Unknown upload type.'), '');
            const dir = absoluteDir(bucket);
            // Created on demand: a fresh checkout has no uploads directory.
            mkdir(dir, { recursive: true })
                .then(() => cb(null, dir))
                .catch((e) => cb(e, ''));
        },
        filename(req, file, cb) {
            const extension = EXTENSIONS[file.mimetype] ?? path.extname(file.originalname).toLowerCase() ?? '';
            cb(null, `${randomUUID()}${extension}`);
        },
    }),
    limits: { fileSize: MAX_BYTES, files: 10 },
    fileFilter(req, file, cb) {
        const bucket = String(req.params.bucket);
        if (!isBucket(bucket))
            return cb(badRequest('Unknown upload type.'));
        if (!allowedFor(bucket).has(file.mimetype)) {
            const allowed = bucket === 'documentation' ? 'an image or a PDF' : 'an image';
            return cb(badRequest(`${file.originalname} is not ${allowed}.`));
        }
        cb(null, true);
    },
});
export const MAX_UPLOAD_BYTES = MAX_BYTES;
