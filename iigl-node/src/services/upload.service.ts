import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { badRequest } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { publicUrlFor, putObject, storageConfigured } from '../lib/storage.js';

/**
 * File uploads.
 *
 * Files go to Cloudflare R2, keyed by the same relative path Laravel used on
 * disk — `uploads/report/<file>` — and the database still stores the same
 * `public/uploads/...` string it always did. Nothing about the schema or the
 * old application's readers changes: only where the bytes live.
 *
 * When R2 is not configured the file is written to the legacy public directory
 * instead, exactly as before. That is the development path and the fallback,
 * not a second format — the stored path is identical either way, so a record
 * does not record which of the two took the file.
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
} as const;

export type Bucket = keyof typeof BUCKETS;

export const isBucket = (v: string): v is Bucket => v in BUCKETS;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const DOCUMENT_TYPES = new Set([...IMAGE_TYPES, 'application/pdf']);

/** Documentation may be a PDF; everything else is an image. */
const allowedFor = (bucket: Bucket) =>
  bucket === 'documentation' ? DOCUMENT_TYPES : IMAGE_TYPES;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const MAX_BYTES = 8 * 1024 * 1024;

export function absoluteDir(bucket: Bucket): string {
  return path.resolve(env.legacyPublicRoot, BUCKETS[bucket]);
}

/**
 * The path stored in the database. Laravel prefixes `public/`, and every
 * reader — including the certificate renderer — strips that prefix back off,
 * so new rows keep the convention rather than becoming a second format.
 */
export function storedPath(bucket: Bucket, filename: string): string {
  return `public/${BUCKETS[bucket]}/${filename}`;
}

/**
 * The R2 object key for a stored path. The `public/` prefix is Laravel's own
 * document-root convention and means nothing to the bucket, so it comes off:
 * the key mirrors the public tree, which is what a bulk copy of the existing
 * files would produce.
 */
export function objectKey(stored: string): string {
  return stored.replace(/^\/?public\//, '').replace(/^\/+/, '');
}

/** Where a stored path can be read from, if anywhere. */
export function readUrlFor(stored: string): string {
  return publicUrlFor(objectKey(stored));
}

const extensionFor = (file: Express.Multer.File) =>
  EXTENSIONS[file.mimetype] ?? path.extname(file.originalname).toLowerCase() ?? '';

/**
 * Files are buffered in memory rather than written straight to disk, because
 * the destination is an HTTP PUT to R2 and not a directory. 8 MB a file and ten
 * files a request bounds that at 80 MB, which is why the limit stays.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 10 },
  fileFilter(req, file, cb) {
    const bucket = String(req.params.bucket);
    if (!isBucket(bucket)) return cb(badRequest('Unknown upload type.'));

    if (!allowedFor(bucket).has(file.mimetype)) {
      const allowed = bucket === 'documentation' ? 'an image or a PDF' : 'an image';
      return cb(badRequest(`${file.originalname} is not ${allowed}.`));
    }
    cb(null, true);
  },
});

export interface StoredFile {
  /** What goes in the database: `public/uploads/<bucket>/<file>`. */
  path: string;
  /** Where it can be read from directly, or '' when there is no public domain. */
  url: string;
  original_name: string;
  bytes: number;
  mime: string;
  /** 'r2' or 'disk' — which of the two took the bytes. */
  storage: 'r2' | 'disk';
}

/**
 * Puts one uploaded file where it belongs and returns what to store.
 *
 * A failed PUT throws rather than quietly falling back to disk: a file written
 * to a machine the next request may not reach is worse than an upload that
 * plainly failed and can be retried.
 */
export async function store(bucket: Bucket, file: Express.Multer.File): Promise<StoredFile> {
  const filename = `${randomUUID()}${extensionFor(file)}`;
  const stored = storedPath(bucket, filename);

  if (storageConfigured) {
    await putObject(objectKey(stored), file.buffer, file.mimetype);
    return {
      path: stored,
      url: readUrlFor(stored),
      original_name: file.originalname,
      bytes: file.size,
      mime: file.mimetype,
      storage: 'r2',
    };
  }

  const dir = absoluteDir(bucket);
  // Created on demand: a fresh checkout has no uploads directory.
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), file.buffer);

  return {
    path: stored,
    url: '',
    original_name: file.originalname,
    bytes: file.size,
    mime: file.mimetype,
    storage: 'disk',
  };
}

export const MAX_UPLOAD_BYTES = MAX_BYTES;
