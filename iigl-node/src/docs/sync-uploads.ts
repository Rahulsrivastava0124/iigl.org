/**
 * Copies the Laravel `public/` tree into the R2 bucket.
 *
 *   npm run sync:uploads -- --dry-run
 *   npm run sync:uploads
 *
 * Every uploaded file the database names — item images, signatures, employee
 * papers, banners, icons, payment screenshots — still lives on the Laravel
 * disk. The rows now point at them from this schema, but the bytes were never
 * moved, so a certificate opened in the panel has nothing to draw.
 *
 * ## The key is the path with `public/` taken off
 *
 * Nothing is renamed and nothing is converted. `upload.service.ts` already
 * writes new files under the same scheme — the database keeps Laravel's
 * `public/uploads/<bucket>/<file>` string and `objectKey()` strips the
 * `public/` prefix to get the object key — so a bulk copy that mirrors the
 * tree lands exactly where the API looks:
 *
 *   public/uploads/report/1629970999main.jpg   the row
 *   uploads/report/1629970999main.jpg          the object
 *
 * That is why this walks the whole `public/` directory rather than the nine
 * upload buckets: `card.service.ts` reads `card-logo.png` and the other brand
 * images from the same root, and they are the files a card is drawn with.
 *
 * ## Re-runnable
 *
 * The bucket is listed once up front and a file is sent only when its key is
 * missing or the object's size differs. So an interrupted run is resumed by
 * running it again, and a second run over a finished copy sends nothing.
 *
 * Sizes, not checksums: R2's ETag is an MD5 only for objects that were not
 * uploaded in parts, and the comparison would then be wrong for exactly the
 * large files it matters for. Nothing rewrites these files in place, so a name
 * that matches with the same length is the same file.
 *
 * ## Flags
 *
 *   --root=<path>       the Laravel public directory (default: LEGACY_PUBLIC_ROOT)
 *   --only=<prefixes>   comma separated key prefixes, e.g. uploads/report
 *   --concurrency=<n>   files in flight (default 8)
 *   --dry-run           list what would be sent, send nothing
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../lib/env.js';
import { r2, storageConfigured } from '../lib/storage.js';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit === undefined) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
};

const ROOT = path.resolve(flag('root') || env.legacyPublicRoot);
const ONLY = (flag('only') ?? '')
  .split(',')
  .map((s) => s.trim().replace(/^\/+|\/+$/g, ''))
  .filter(Boolean);
const CONCURRENCY = Math.max(1, Number(flag('concurrency') ?? 8));
const DRY = flag('dry-run') !== undefined;

/**
 * Not every file under `public/` is an asset. The PHP entry points and the
 * web-server configuration are the old application itself, and the bucket is
 * read over a public domain, so they are left where they are.
 */
const SKIP_EXTENSIONS = new Set(['.php', '.zip', '.config', '.shtml']);
const SKIP_NAMES = new Set(['.htaccess', 'error_log', '.ds_store', 'web.config']);

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.webmanifest': 'application/manifest+json',
};

interface Local {
  key: string;
  file: string;
  size: number;
}

const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;

/** Every file under the root, keyed the way the bucket keys it. */
async function walk(): Promise<Local[]> {
  const names = await readdir(ROOT, { recursive: true, withFileTypes: true });
  const out: Local[] = [];

  for (const entry of names) {
    if (!entry.isFile()) continue;

    const file = path.join(entry.parentPath, entry.name);
    const key = path.relative(ROOT, file).split(path.sep).join('/');
    const ext = path.extname(entry.name).toLowerCase();

    if (SKIP_EXTENSIONS.has(ext)) continue;
    if (SKIP_NAMES.has(entry.name.toLowerCase())) continue;
    if (ONLY.length && !ONLY.some((p) => key === p || key.startsWith(`${p}/`))) continue;

    out.push({ key, file, size: (await stat(file)).size });
  }

  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** What the bucket already holds, as key -> size. */
async function listBucket(): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  let token: string | undefined;

  do {
    const page = await r2!.send(
      new ListObjectsV2Command({ Bucket: env.r2.bucket, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) {
      if (o.Key) held.set(o.Key, o.Size ?? -1);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return held;
}

async function main() {
  if (!storageConfigured || !r2) {
    console.error('R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.');
    process.exit(1);
  }

  await stat(ROOT).catch(() => {
    console.error(`No such directory: ${ROOT}`);
    console.error('Pass --root=<path to the Laravel public directory>.');
    process.exit(1);
  });

  console.log(`source  ${ROOT}`);
  console.log(`bucket  ${env.r2.bucket}`);
  if (ONLY.length) console.log(`only    ${ONLY.join(', ')}`);
  console.log('');

  const [files, held] = await Promise.all([walk(), listBucket()]);
  const total = files.reduce((n, f) => n + f.size, 0);
  console.log(`${files.length} files on disk, ${mb(total)}`);
  console.log(`${held.size} objects already in the bucket`);

  const todo = files.filter((f) => held.get(f.key) !== f.size);
  const replacing = todo.filter((f) => held.has(f.key)).length;
  const bytes = todo.reduce((n, f) => n + f.size, 0);
  console.log(
    `${todo.length} to send (${mb(bytes)}), of which ${replacing} replace an object whose size differs`,
  );
  console.log('');

  if (!todo.length) {
    console.log('Nothing to do.');
    return;
  }

  if (DRY) {
    for (const f of todo.slice(0, 20)) console.log(`  would send  ${f.key}`);
    if (todo.length > 20) console.log(`  ... and ${todo.length - 20} more`);
    console.log('\nDry run: nothing was sent.');
    return;
  }

  /*
    A worker per slot, each taking the next file off one shared index. A fixed
    pool rather than a chunked Promise.all: the files are anything from 2 KB to
    6 MB, and a chunk of eight only moves on when its slowest member lands.
  */
  let next = 0;
  let sent = 0;
  let sentBytes = 0;
  const failures: Array<{ key: string; reason: string }> = [];
  const started = Date.now();
  let lastLine = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= todo.length) return;
      const f = todo[i]!;

      try {
        await r2!.send(
          new PutObjectCommand({
            Bucket: env.r2.bucket,
            Key: f.key,
            Body: await readFile(f.file),
            ContentType: CONTENT_TYPES[path.extname(f.key).toLowerCase()] ?? 'application/octet-stream',
          }),
        );
        sent++;
        sentBytes += f.size;
      } catch (error) {
        failures.push({ key: f.key, reason: (error as Error).message });
      }

      const now = Date.now();
      if (now - lastLine > 3000) {
        lastLine = now;
        const done = sent + failures.length;
        const rate = sentBytes / Math.max(1, (now - started) / 1000);
        const left = (bytes - sentBytes) / Math.max(1, rate);
        console.log(
          `  ${done}/${todo.length}  ${mb(sentBytes)}  ${mb(rate)}/s  ~${Math.round(left / 60)} min left`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const took = Math.round((Date.now() - started) / 1000);
  console.log('');
  console.log(`Sent ${sent} files, ${mb(sentBytes)}, in ${Math.floor(took / 60)}m ${took % 60}s.`);

  if (failures.length) {
    const report = failures.map((f) => `${f.key}\t${f.reason}`).join('\n');
    await writeFile('upload-failures.txt', `${report}\n`, 'utf8');
    console.error(`${failures.length} failed. Named in upload-failures.txt; run again to retry them.`);
    process.exit(1);
  }

  console.log('No failures. Run `npm run check:uploads` to check the rows against the bucket.');
}

await main();
