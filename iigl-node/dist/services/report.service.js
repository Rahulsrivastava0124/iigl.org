import { db } from '../db/index.js';
import { badRequest, conflict } from '../lib/errors.js';
/**
 * Rebuilds the Laravel report number: lab id (2), day (2), running count (4),
 * yymm (4). Verified against live rows — 122600012608 is lab 12, day 26,
 * first report of the day, August 2026.
 */
export function buildReportNo(labId, dailyCount, now = new Date()) {
    const p = (n, w) => String(n).padStart(w, '0');
    const lab = labId > 9 ? String(labId) : `0${labId}`;
    const yy = String(now.getFullYear()).slice(-2);
    return `${lab}${p(now.getDate(), 2)}${p(dailyCount, 4)}${yy}${p(now.getMonth() + 1, 2)}`;
}
/** Reports already created today by this lab, which seeds the counter. */
async function dailyCountForLab(labId, trx) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const row = await trx
        .selectFrom('reports')
        .select(db.fn.countAll().as('n'))
        .where('lab_id', '=', labId)
        .where('created_at', '>=', start)
        .where('created_at', '<', end)
        .executeTakeFirstOrThrow();
    return Number(row.n);
}
export function validateReportInput(body) {
    const b = (body ?? {});
    if (!b.order_id)
        throw badRequest('Order is required.');
    if (!b.order_detail_id)
        throw badRequest('Order item is required.');
    if (!b.subcategory_id)
        throw badRequest('Subcategory is required.');
    const attrs = Array.isArray(b.attributes) ? b.attributes : [];
    return {
        order_id: Number(b.order_id),
        order_detail_id: Number(b.order_detail_id),
        subcategory_id: Number(b.subcategory_id),
        gross_weight: b.gross_weight != null ? String(b.gross_weight) : null,
        gross_wt_unit: b.gross_wt_unit != null ? Number(b.gross_wt_unit) : null,
        carat_weight: b.carat_weight != null ? String(b.carat_weight) : null,
        stone_wt_unit: b.stone_wt_unit != null ? Number(b.stone_wt_unit) : null,
        size: b.size != null ? String(b.size) : null,
        comments: b.comments != null ? String(b.comments) : null,
        is_approx: b.is_approx ? 1 : 0,
        item_image: b.item_image != null ? String(b.item_image) : null,
        attributes: attrs.map((raw) => {
            const a = (raw ?? {});
            if (!a.attr_id)
                throw badRequest('Each attribute needs an attr_id.');
            return {
                attr_id: String(a.attr_id),
                attr_value: a.attr_value != null ? String(a.attr_value) : null,
                attr_desc: a.attr_desc != null ? String(a.attr_desc) : null,
                ...(a.attr_img != null ? { attr_img: String(a.attr_img) } : {}),
            };
        }),
    };
}
/**
 * Turns submitted attribute values into what the report stores.
 *
 * Open-source attributes accept free text: a value not already in
 * attribute_values creates a new row, and the report stores the new id. This is
 * load-bearing — the certificate renderer resolves attr_value through that
 * table, so a raw string would render blank.
 *
 * Shared by create and update so the two cannot drift apart; the Laravel
 * versions are two copies of the same loop.
 */
async function resolveAttributes(trx, attributes, categoryId, subcategoryId) {
    const resolved = [];
    for (const a of attributes) {
        const attr = await trx
            .selectFrom('attributes')
            .select(['id', 'is_opensource'])
            .where('id', '=', Number(a.attr_id))
            .executeTakeFirst();
        if (!attr)
            throw badRequest(`Unknown attribute ${a.attr_id}.`);
        let value = a.attr_value;
        if (attr.is_opensource && value) {
            const found = await trx
                .selectFrom('attribute_values')
                .select('id')
                .where('attr_id', '=', Number(a.attr_id))
                .where('value_name', '=', value)
                .executeTakeFirst();
            if (found) {
                value = String(found.id);
            }
            else {
                const created = await trx
                    .insertInto('attribute_values')
                    .values({
                    category_id: categoryId,
                    subcategory_id: subcategoryId,
                    attr_id: Number(a.attr_id),
                    value_name: value,
                    is_deleted: 0,
                    created_at: new Date(),
                    updated_at: new Date(),
                })
                    .executeTakeFirst();
                value = String(Number(created.insertId));
            }
        }
        resolved.push({ ...a, attr_value: value });
    }
    return resolved;
}
export async function createReport(user, input) {
    if (user.labId === null) {
        throw badRequest('Your account is not linked to a laboratory, so it cannot issue reports.');
    }
    const labId = user.labId;
    return db.transaction().execute(async (trx) => {
        // A report per item, capped by the quantity ordered.
        const detail = await trx
            .selectFrom('order_details')
            .select(['id', 'qty', 'category_id'])
            .where('id', '=', input.order_detail_id)
            .executeTakeFirst();
        if (!detail)
            throw badRequest('That order item does not exist.');
        const existing = await trx
            .selectFrom('reports')
            .select(db.fn.countAll().as('n'))
            .where('order_detail_id', '=', String(input.order_detail_id))
            .executeTakeFirstOrThrow();
        if (Number(existing.n) >= Number(detail.qty)) {
            throw conflict(`All ${detail.qty} reports for this item have already been created.`);
        }
        const resolved = await resolveAttributes(trx, input.attributes, Number(detail.category_id), input.subcategory_id);
        /**
         * The number is a running count, so two certificates created in the same
         * second can read the same count and be issued the same number. That has
         * already happened once in the live data: 043100002110 belongs to two
         * different stones, issued 81 seconds apart on 2021-11-01.
         *
         * There is no unique index on report_no to catch it, so the collision is
         * checked for here and the count stepped past it. A unique index should
         * follow once the existing duplicate is resolved.
         */
        let count = (await dailyCountForLab(labId, trx)) + 1;
        let reportNo = buildReportNo(labId, count);
        for (let attempt = 0; attempt < 25; attempt++) {
            const clash = await trx
                .selectFrom('reports')
                .select('id')
                .where('report_no', '=', reportNo)
                .executeTakeFirst();
            if (!clash)
                break;
            count++;
            reportNo = buildReportNo(labId, count);
        }
        const result = await trx
            .insertInto('reports')
            .values({
            report_no: reportNo,
            order_no: String(input.order_id),
            order_detail_id: String(input.order_detail_id),
            subcategory_id: String(input.subcategory_id),
            gross_weight: input.gross_weight ?? '',
            gross_wt_unit: input.gross_wt_unit ?? 0,
            carat_weight: input.carat_weight ?? '',
            stone_wt_unit: input.stone_wt_unit ?? 0,
            size: input.size,
            comments: input.comments,
            is_approx: input.is_approx ?? 0,
            item_image: input.item_image ?? '',
            description: JSON.stringify(resolved),
            smart_card_price: '200',
            classic_card_price: '400',
            user_id: user.id,
            lab_id: labId,
            created_at: new Date(),
            updated_at: new Date(),
        })
            .executeTakeFirst();
        return Number(result.insertId);
    });
}
/**
 * Expands the JSON blob into readable attribute names and values, batching the
 * lookups so a list of reports costs two queries rather than two per row.
 */
export async function expandAttributes(descriptions) {
    const parsed = descriptions.map((d) => {
        if (!d)
            return [];
        try {
            const v = JSON.parse(d);
            return Array.isArray(v) ? v : [];
        }
        catch {
            return [];
        }
    });
    const attrIds = new Set();
    const valueIds = new Set();
    for (const list of parsed) {
        for (const a of list) {
            if (a.attr_id)
                attrIds.add(Number(a.attr_id));
            if (a.attr_value && /^\d+$/.test(a.attr_value))
                valueIds.add(Number(a.attr_value));
        }
    }
    const [attrs, values] = await Promise.all([
        attrIds.size
            ? db
                .selectFrom('attributes')
                .select(['id', 'attr_name', 'show_in_smart_card', 'show_in_classic_card', 'order_no'])
                .where('id', 'in', [...attrIds])
                .execute()
            : Promise.resolve([]),
        valueIds.size
            ? db
                .selectFrom('attribute_values')
                .select(['id', 'value_name', 'icon'])
                .where('id', 'in', [...valueIds])
                .execute()
            : Promise.resolve([]),
    ]);
    const attrById = new Map(attrs.map((a) => [Number(a.id), a]));
    const valueById = new Map(values.map((v) => [Number(v.id), v]));
    return parsed.map((list) => list.map((a) => {
        const attr = attrById.get(Number(a.attr_id));
        const val = a.attr_value ? valueById.get(Number(a.attr_value)) : undefined;
        return {
            attr_id: Number(a.attr_id),
            attr_name: attr?.attr_name ?? null,
            value: val?.value_name ?? a.attr_value,
            value_icon: val?.icon ?? null,
            description: a.attr_desc,
            image: a.attr_img ?? null,
            show_in_smart_card: attr?.show_in_smart_card ?? 0,
            show_in_classic_card: attr?.show_in_classic_card ?? 0,
            order_no: attr?.order_no ?? 0,
        };
    }));
}
export function validateUpdateReportInput(body) {
    const b = (body ?? {});
    const out = {};
    if (b.subcategory_id != null)
        out.subcategory_id = Number(b.subcategory_id);
    if (b.gross_weight !== undefined)
        out.gross_weight = b.gross_weight == null ? null : String(b.gross_weight);
    if (b.gross_wt_unit !== undefined)
        out.gross_wt_unit = b.gross_wt_unit == null ? null : Number(b.gross_wt_unit);
    if (b.carat_weight !== undefined)
        out.carat_weight = b.carat_weight == null ? null : String(b.carat_weight);
    if (b.stone_wt_unit !== undefined)
        out.stone_wt_unit = b.stone_wt_unit == null ? null : Number(b.stone_wt_unit);
    if (b.size !== undefined)
        out.size = b.size == null ? null : String(b.size);
    if (b.comments !== undefined)
        out.comments = b.comments == null ? null : String(b.comments);
    if (b.is_approx !== undefined)
        out.is_approx = b.is_approx ? 1 : 0;
    if (b.item_image !== undefined)
        out.item_image = b.item_image == null ? null : String(b.item_image);
    if (b.attributes !== undefined) {
        if (!Array.isArray(b.attributes))
            throw badRequest('Attributes must be a list.');
        out.attributes = b.attributes.map((raw) => {
            const a = (raw ?? {});
            if (!a.attr_id)
                throw badRequest('Each attribute needs an attr_id.');
            return {
                attr_id: String(a.attr_id),
                attr_value: a.attr_value != null ? String(a.attr_value) : null,
                attr_desc: a.attr_desc != null ? String(a.attr_desc) : null,
                ...(a.attr_img != null ? { attr_img: String(a.attr_img) } : {}),
            };
        });
    }
    if (Object.keys(out).length === 0)
        throw badRequest('Nothing to update.');
    return out;
}
/**
 * Amends an issued certificate. report_no, order_no, lab_id and user_id are
 * never touched — the number is printed on a document already in circulation,
 * and re-issuing it under a different number would orphan the original.
 * Attributes, when supplied, replace the whole set, matching the PHP.
 */
export async function updateReport(reportId, input) {
    return db.transaction().execute(async (trx) => {
        const report = await trx
            .selectFrom('reports')
            .select(['id', 'order_detail_id', 'subcategory_id'])
            .where('id', '=', reportId)
            .executeTakeFirst();
        if (!report)
            throw badRequest('Report not found.');
        const patch = { updated_at: new Date() };
        if (input.subcategory_id != null)
            patch.subcategory_id = String(input.subcategory_id);
        // These columns are NOT NULL in the live schema.
        if (input.gross_weight !== undefined)
            patch.gross_weight = input.gross_weight ?? '';
        if (input.carat_weight !== undefined)
            patch.carat_weight = input.carat_weight ?? '';
        if (input.item_image !== undefined)
            patch.item_image = input.item_image ?? '';
        if (input.gross_wt_unit !== undefined)
            patch.gross_wt_unit = input.gross_wt_unit ?? 0;
        if (input.stone_wt_unit !== undefined)
            patch.stone_wt_unit = input.stone_wt_unit ?? 0;
        if (input.size !== undefined)
            patch.size = input.size;
        if (input.comments !== undefined)
            patch.comments = input.comments;
        if (input.is_approx !== undefined)
            patch.is_approx = input.is_approx;
        if (input.attributes) {
            const detail = await trx
                .selectFrom('order_details')
                .select('category_id')
                .where('id', '=', Number(report.order_detail_id))
                .executeTakeFirst();
            const resolved = await resolveAttributes(trx, input.attributes, Number(detail?.category_id ?? 0), input.subcategory_id ?? Number(report.subcategory_id));
            patch.description = JSON.stringify(resolved);
        }
        await trx
            .updateTable('reports')
            .set(patch)
            .where('id', '=', reportId)
            .execute();
        return reportId;
    });
}
