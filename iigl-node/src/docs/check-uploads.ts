/**
 * Does every file path in the database name an object that is actually there?
 *
 *   npm run check:uploads
 *
 * Paths and bytes are two different migrations. The rows came over from the
 * Laravel database; the files they name were copied separately by
 * `npm run sync:uploads`. This is what says the two agree — a row pointing at
 * an object the bucket does not hold is a broken image on a certificate, and
 * nothing else reports it until somebody opens that certificate.
 *
 * Every column that holds a path is read, including the two that hold JSON:
 * `users.documents` is a list of `{title, path}` and `site_profiles.gallery` is
 * a list of paths.
 *
 * The comparison is on the key, not on an HTTP request: the bucket is listed
 * once and the paths are matched against it in memory, so 22,000 certificates
 * cost one listing rather than 22,000 round trips.
 *
 * Read-only. Missing files are printed, grouped by folder, with an example.
 */
import { writeFile } from 'node:fs/promises';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import { env } from '../lib/env.js';
import { objectKey } from '../services/upload.service.js';
import { r2, storageConfigured } from '../lib/storage.js';

/** Every column that holds one path, as `table.column`. */
const PATH_COLUMNS: Array<[table: string, column: string]> = [
  ['attribute_values', 'icon'],
  ['blogs', 'banner'],
  ['blogs', 'thumbnail'],
  ['branches', 'img'],
  ['categories', 'banner'],
  ['categories', 'icon'],
  ['company_certificates', 'image'],
  ['courses', 'certificate_template'],
  ['courses', 'image'],
  ['education_gallery', 'image'],
  ['orders', 'show_image_in_card_file'],
  ['registered_customers', 'logo'],
  ['registered_customers', 'show_image_in_card_file'],
  ['reports', 'item_image'],
  ['reporttypes', 'banner'],
  ['reporttypes', 'icon'],
  ['site_profiles', 'banner'],
  ['staff_messages', 'attachment'],
  ['student_certificates', 'file'],
  ['students', 'extra_doc'],
  ['students', 'id_proof'],
  ['students', 'photo'],
  ['students', 'qualification_doc'],
  ['subcategories', 'banner'],
  ['subcategories', 'icon'],
  ['transactions', 'attachment'],
  ['users', 'adhar_photo'],
  ['users', 'company_logo'],
  ['users', 'dl_photo'],
  ['users', 'documentation'],
  ['users', 'pan_photo'],
  ['users', 'passport_photo'],
  ['users', 'profile_photo'],
  ['users', 'signature'],
  ['users', 'voter_photo'],
  ['websites', 'banner'],
];

interface Reference {
  where: string;
  id: number;
  stored: string;
}

const raw = async (query: string) => (await sql.raw<Record<string, any>>(query).execute(db)).rows;

/**
 * A stored value is a path only if it looks like one. These columns have held
 * free text at some point in their life — `bank_name` was once written into a
 * signature field by hand — and a value with no slash in it names no file.
 */
const looksLikePath = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '' && v.includes('/');

async function collect(): Promise<Reference[]> {
  const refs: Reference[] = [];

  for (const [table, column] of PATH_COLUMNS) {
    const rows = await raw(
      `SELECT id, \`${column}\` AS v FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> ''`,
    );
    for (const r of rows) {
      if (looksLikePath(r.v)) refs.push({ where: `${table}.${column}`, id: Number(r.id), stored: r.v });
    }
  }

  // users.documents — [{title, path, added_at}]
  for (const r of await raw(`SELECT id, documents FROM users WHERE documents IS NOT NULL`)) {
    const list = typeof r.documents === 'string' ? JSON.parse(r.documents) : r.documents;
    if (!Array.isArray(list)) continue;
    for (const d of list) {
      if (looksLikePath(d?.path)) refs.push({ where: 'users.documents', id: Number(r.id), stored: d.path });
    }
  }

  // site_profiles.gallery — [path, path, ...]
  for (const r of await raw(`SELECT id, gallery FROM site_profiles WHERE gallery IS NOT NULL`)) {
    const list = typeof r.gallery === 'string' ? JSON.parse(r.gallery) : r.gallery;
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (looksLikePath(p)) refs.push({ where: 'site_profiles.gallery', id: Number(r.id), stored: p });
    }
  }

  return refs;
}

async function listBucket(): Promise<Set<string>> {
  const keys = new Set<string>();
  let token: string | undefined;

  do {
    const page = await r2!.send(
      new ListObjectsV2Command({ Bucket: env.r2.bucket, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) if (o.Key) keys.add(o.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

async function main() {
  if (!storageConfigured || !r2) {
    console.error('R2 is not configured; there is nothing to check against.');
    process.exit(1);
  }

  const [refs, keys] = await Promise.all([collect(), listBucket()]);

  // The same file is named by many rows — one item image per certificate, one
  // signature by every order a laboratory took — so the count that matters is
  // of distinct files, and a missing one is reported once with its referrers.
  const missing = new Map<string, Reference[]>();
  const present = new Set<string>();

  for (const ref of refs) {
    const key = objectKey(ref.stored);
    if (keys.has(key)) {
      present.add(key);
      continue;
    }
    const at = missing.get(key);
    if (at) at.push(ref);
    else missing.set(key, [ref]);
  }

  const distinct = present.size + missing.size;
  console.log(`bucket      ${env.r2.bucket}, ${keys.size} objects`);
  console.log(`referenced  ${refs.length} paths in ${PATH_COLUMNS.length + 2} columns, ${distinct} distinct files`);
  console.log(`present     ${present.size}`);
  console.log(`missing     ${missing.size}`);

  if (!missing.size) {
    console.log('\nEvery file the database names is in the bucket.');
    return;
  }

  // Grouped by folder: a missing folder is one copy that did not run, and a
  // missing file inside a folder that is otherwise complete is its own story.
  const byFolder = new Map<string, string[]>();
  for (const key of missing.keys()) {
    const folder = key.split('/').slice(0, 2).join('/');
    const at = byFolder.get(folder);
    if (at) at.push(key);
    else byFolder.set(folder, [key]);
  }

  console.log('');
  for (const [folder, list] of [...byFolder].sort((a, b) => b[1].length - a[1].length)) {
    const first = missing.get(list[0]!)![0]!;
    console.log(`  ${String(list.length).padStart(6)}  ${folder.padEnd(24)} e.g. ${list[0]} (${first.where} #${first.id})`);
  }

  /*
    `--write=<file>` puts the missing keys where `fetch:uploads` can read them.

    The two scripts compose on purpose: this one says what is missing, that one
    goes and gets it from the live site, and running this again afterwards is
    how you know it worked. Writing the list here rather than having the fetch
    work it out keeps one answer to "what is missing" instead of two.
  */
  const writeTo = process.argv
    .slice(2)
    .find((a) => a.startsWith('--write='))
    ?.slice('--write='.length);

  if (writeTo) {
    await writeFile(writeTo, [...missing.keys()].sort().join('\n') + '\n', 'utf8');
    console.log(`\n${missing.size} keys written to ${writeTo}.`);
    console.log(`Fetch them with: npm run fetch:uploads -- --keys=${writeTo}`);
  } else {
    console.log('\nFrom a local copy of the Laravel public directory: npm run sync:uploads');
    console.log('From the live site: re-run with --write=<file>, then npm run fetch:uploads.');
  }

  process.exitCode = 1;
}

await main();
await db.destroy();
