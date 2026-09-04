import { readFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { db } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { expandAttributes } from './report.service.js';
import { env } from '../lib/env.js';
import { getObjectBuffer } from '../lib/storage.js';
/**
 * Assembles everything a certificate card needs to render.
 *
 * Images are inlined as data URIs rather than linked. The renderer runs in a
 * headless browser with no access to the PHP document root, and an inlined
 * asset also means a card cannot silently lose its logo because a path moved.
 */
/** Where the Laravel public/ directory lives, for logos and uploads. */
const PUBLIC_ROOT = env.legacyPublicRoot;
const MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
};
const assetCache = new Map();
/**
 * Reads an asset and returns it as a data URI, or null when it is missing.
 * Stored paths look like `public/uploads/report/123main.jpg`, relative to the
 * Laravel project root, so the leading `public/` is stripped.
 *
 * Disk first, then R2 — the same order `/api/files` uses, and for the same
 * reason: everything Laravel wrote is on disk, everything since is in the
 * bucket, and a stat is cheaper than a request. A card whose image is in
 * neither renders without it rather than failing.
 */
export async function asDataUri(storedPath) {
    if (!storedPath)
        return null;
    if (assetCache.has(storedPath))
        return assetCache.get(storedPath) ?? null;
    const relative = storedPath.replace(/^\/?public\//, '').replace(/^\/+/, '');
    const absolute = path.resolve(PUBLIC_ROOT, relative);
    const mime = MIME[path.extname(relative).toLowerCase()] ?? 'application/octet-stream';
    // Never read outside the public root, whatever the database holds.
    const insideRoot = absolute.startsWith(path.resolve(PUBLIC_ROOT));
    let buffer = null;
    if (insideRoot) {
        buffer = await readFile(absolute).catch(() => null);
    }
    buffer ??= await getObjectBuffer(relative);
    const uri = buffer ? `data:${mime};base64,${buffer.toString('base64')}` : null;
    assetCache.set(storedPath, uri);
    return uri;
}
export async function loadChrome() {
    const [cardLogo, backLogo, watermark] = await Promise.all([
        asDataUri('public/card-logo.png'),
        asDataUri('public/back-logo.png'),
        asDataUri('public/bg.png'),
    ]);
    return { cardLogo, backLogo, watermark };
}
/**
 * Builds card data for a set of reports in a fixed number of queries, so
 * printing forty cards does not issue forty times the work.
 */
export async function cardDataFor(reportIds) {
    if (reportIds.length === 0)
        return [];
    const reports = await db
        .selectFrom('reports')
        .selectAll()
        .where('id', 'in', reportIds)
        .execute();
    if (reports.length === 0)
        throw notFound('No certificates found.');
    const [subcategories, units, labs, expanded] = await Promise.all([
        db.selectFrom('subcategories').select(['id', 'name']).execute(),
        db.selectFrom('units').select(['id', 'name', 'symbol']).execute(),
        db
            .selectFrom('users')
            .select(['id', 'signature'])
            .where('id', 'in', [...new Set(reports.map((r) => Number(r.lab_id)))])
            .execute(),
        expandAttributes(reports.map((r) => r.description)),
    ]);
    const subById = new Map(subcategories.map((s) => [Number(s.id), s.name]));
    const unitById = new Map(units.map((u) => [Number(u.id), u.symbol || u.name]));
    const signatureByLab = new Map(labs.map((l) => [Number(l.id), l.signature]));
    // Preserve the order the caller asked for, not the order MySQL returned.
    const byId = new Map(reports.map((r, i) => [Number(r.id), { report: r, attributes: expanded[i] }]));
    const out = [];
    for (const id of reportIds) {
        const entry = byId.get(id);
        if (!entry)
            continue;
        const { report, attributes } = entry;
        const ordered = [...attributes].sort((a, b) => Number(a.order_no) - Number(b.order_no));
        const verifyUrl = `${env.publicSiteUrl}/verify-report/${report.id}`;
        const [itemImage, signature, qr] = await Promise.all([
            asDataUri(report.item_image),
            asDataUri(signatureByLab.get(Number(report.lab_id)) ?? null),
            QRCode.toDataURL(verifyUrl, { margin: 0, width: 300, errorCorrectionLevel: 'M' }),
        ]);
        out.push({
            report_no: report.report_no,
            report_id: Number(report.id),
            gross_weight: report.gross_weight,
            gross_wt_unit: unitById.get(Number(report.gross_wt_unit)) ?? null,
            carat_weight: report.carat_weight,
            stone_wt_unit: unitById.get(Number(report.stone_wt_unit)) ?? null,
            size: report.size,
            comments: report.comments,
            is_approx: Boolean(report.is_approx),
            subcategory: subById.get(Number(report.subcategory_id)) ?? null,
            issued_on: report.created_at ? String(report.created_at).slice(0, 10) : '',
            item_image: itemImage,
            signature,
            qr,
            verify_url: verifyUrl,
            smart_attributes: ordered
                .filter((a) => a.show_in_smart_card && a.value)
                .map((a) => ({ name: a.attr_name ?? '', value: String(a.value) })),
            classic_attributes: ordered
                .filter((a) => a.show_in_classic_card && a.value)
                .map((a) => ({
                name: a.attr_name ?? '',
                value: String(a.value),
                description: a.description,
            })),
        });
    }
    return out;
}
