/**
 * Fetches files the local Laravel copy does not have from the live site, and
 * puts them in the bucket.
 *
 *   npm run fetch:uploads -- --keys=missing_keys.txt --dry-run
 *   npm run fetch:uploads -- --keys=missing_keys.txt
 *
 * `sync:uploads` copies from a directory. That directory is a snapshot, and the
 * Laravel application kept writing after it was taken — the copy on this
 * machine stops in April 2025, while the database names item images written up
 * to the day of the dump. Those files exist only on the production server.
 *
 * They are still served there, at `PUBLIC_SITE_URL/public/<key>` — the same
 * key the bucket uses, under Laravel's document root. So each one is fetched
 * over HTTP and put straight into R2 without touching the disk.
 *
 * ## This reads from a live website
 *
 * It is the customer's own server, but it is serving customers at the same
 * time, so the defaults are deliberately unhurried: four requests at a time
 * and a pause between them. `--concurrency` and `--delay` are there to be
 * lowered, not raised. A 404 is recorded rather than retried — a row naming a
 * file the server no longer has is a fact to report, not an error to work
 * around.
 *
 *   --keys=<file>       one key per line, e.g. uploads/report/1757078073main.jpg
 *   --concurrency=<n>   requests in flight (default 4)
 *   --delay=<ms>        pause after each request (default 150)
 *   --limit=<n>         stop after n keys, for a trial run
 *   --dry-run           fetch nothing; just say what would be fetched
 */
import { readFile, writeFile } from 'node:fs/promises';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../lib/env.js';
import { r2, storageConfigured } from '../lib/storage.js';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit === undefined) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
};

const KEYS_FILE = flag('keys');
const CONCURRENCY = Math.max(1, Number(flag('concurrency') ?? 4));
const DELAY = Math.max(0, Number(flag('delay') ?? 150));
const LIMIT = Number(flag('limit') ?? 0);
const DRY = flag('dry-run') !== undefined;
const BASE = `${env.publicSiteUrl}/public`;

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!storageConfigured || !r2) {
    console.error('R2 is not configured.');
    process.exit(1);
  }
  if (!KEYS_FILE) {
    console.error('Pass --keys=<file>, one object key per line.');
    process.exit(1);
  }

  const all = (await readFile(KEYS_FILE, 'utf8'))
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const keys = LIMIT > 0 ? all.slice(0, LIMIT) : all;

  console.log(`source  ${BASE}`);
  console.log(`bucket  ${env.r2.bucket}`);
  console.log(`keys    ${keys.length}${LIMIT > 0 ? ` (of ${all.length}, limited)` : ''}`);
  console.log(`rate    ${CONCURRENCY} at a time, ${DELAY} ms apart\n`);

  if (DRY) {
    for (const k of keys.slice(0, 10)) console.log(`  would fetch  ${BASE}/${k}`);
    if (keys.length > 10) console.log(`  ... and ${keys.length - 10} more`);
    return;
  }

  let next = 0;
  let got = 0;
  let bytes = 0;
  const gone: string[] = [];
  const failed: Array<{ key: string; reason: string }> = [];
  const started = Date.now();
  let lastLine = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= keys.length) return;
      const key = keys[i]!;

      try {
        const res = await fetch(`${BASE}/${key}`, { redirect: 'follow' });

        if (res.status === 404) {
          gone.push(key);
        } else if (!res.ok) {
          failed.push({ key, reason: `HTTP ${res.status}` });
        } else {
          const body = Buffer.from(await res.arrayBuffer());
          const type = res.headers.get('content-type') ?? '';

          // The server answers a missing file with an HTML error page under a
          // 200 on some hosts. An image that is text is not an image.
          if (type.startsWith('text/')) {
            gone.push(key);
          } else {
            await r2!.send(
              new PutObjectCommand({
                Bucket: env.r2.bucket,
                Key: key,
                Body: body,
                ContentType: CONTENT_TYPES[key.split('.').pop()!.toLowerCase()] ?? type ?? 'application/octet-stream',
              }),
            );
            got++;
            bytes += body.length;
          }
        }
      } catch (error) {
        failed.push({ key, reason: (error as Error).message });
      }

      if (DELAY) await sleep(DELAY);

      const now = Date.now();
      if (now - lastLine > 5000) {
        lastLine = now;
        const done = got + gone.length + failed.length;
        const rate = done / Math.max(1, (now - started) / 1000);
        console.log(
          `  ${done}/${keys.length}  ${mb(bytes)}  ${rate.toFixed(1)} files/s  ~${Math.round((keys.length - done) / Math.max(rate, 0.01) / 60)} min left`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const took = Math.round((Date.now() - started) / 1000);
  console.log('');
  console.log(`Fetched ${got} files, ${mb(bytes)}, in ${Math.floor(took / 60)}m ${took % 60}s.`);

  if (gone.length) {
    await writeFile('missing-on-server.txt', `${gone.join('\n')}\n`, 'utf8');
    console.log(`${gone.length} are not on the server either. Named in missing-on-server.txt.`);
  }
  if (failed.length) {
    await writeFile('fetch-failures.txt', failed.map((f) => `${f.key}\t${f.reason}`).join('\n') + '\n', 'utf8');
    console.error(`${failed.length} failed for another reason. Named in fetch-failures.txt; run again to retry them.`);
    process.exitCode = 1;
  }
}

await main();
