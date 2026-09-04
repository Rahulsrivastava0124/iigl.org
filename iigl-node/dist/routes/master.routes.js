import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
/**
 * The master lists.
 *
 * Five short lists head office maintains and every form reads: GST rates, the
 * kinds an enquiry can be, and the three levels of the address hierarchy.
 *
 * They are one router and one factory rather than five copies of the same
 * twenty lines. What differs between them is a table name, a set of columns
 * and a parent — everything else, down to the wording of the refusals, is the
 * same, and five hand-written copies would answer the same question five
 * slightly different ways within a year.
 *
 * **Deactivate, do not delete.** A district taken off the list is still the
 * district on four hundred old addresses. `PATCH /:id/active` is the ordinary
 * way to retire a row; `DELETE` exists for the one written by mistake five
 * minutes ago and refuses as soon as anything points at it.
 *
 * Administrators only, which is where the menu puts it.
 */
export const masterRoutes = Router();
masterRoutes.use(requireAdmin);
const text = (v) => (v == null || v === '' ? null : String(v).trim());
const requireText = (v, field) => {
    const s = text(v);
    if (!s)
        throw badRequest(`${field} is required.`);
    return s;
};
const flag = (v, fallback = 1) => {
    if (v === undefined)
        return fallback;
    return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
};
const MASTERS = [
    {
        path: 'gst',
        table: 'gst_rates',
        label: 'GST rate',
        children: [
            { table: 'courses', column: 'gst_id', noun: 'course' },
            { table: 'prices', column: 'gst_id', noun: 'price' },
        ],
        order: ['percent', 'name'],
        fields: (b, partial) => {
            const out = {};
            if (!partial || b.name !== undefined)
                out.name = requireText(b.name, 'Name');
            if (!partial || b.percent !== undefined) {
                const n = Number(b.percent ?? 0);
                if (!Number.isFinite(n) || n < 0 || n > 100) {
                    throw badRequest('Percent must be a number between 0 and 100.');
                }
                out.percent = n;
            }
            if (!partial || b.is_active !== undefined)
                out.is_active = flag(b.is_active);
            return out;
        },
    },
    {
        path: 'enquiry-types',
        table: 'enquiry_types',
        label: 'Enquiry type',
        children: [{ table: 'enquiries', column: 'kind', noun: 'enquiry' }],
        order: ['sort', 'label'],
        fields: (b, partial) => {
            const out = {};
            // The code is what `enquiries.kind` holds, so it is set once and never
            // edited: renaming it orphans every enquiry filed under the old one.
            if (!partial) {
                const code = requireText(b.code, 'Code')
                    .toLowerCase()
                    .replace(/[^a-z0-9_]+/g, '_');
                if (!code)
                    throw badRequest('Code must contain a letter or a digit.');
                out.code = code;
            }
            if (!partial || b.label !== undefined)
                out.label = requireText(b.label, 'Label');
            if (!partial || b.sort !== undefined)
                out.sort = Number(b.sort ?? 0) || 0;
            if (!partial || b.is_active !== undefined)
                out.is_active = flag(b.is_active);
            return out;
        },
    },
    {
        path: 'countries',
        table: 'countries',
        label: 'Country',
        children: [{ table: 'states', column: 'country_id', noun: 'state' }],
        order: ['name'],
        fields: (b, partial) => {
            const out = {};
            if (!partial || b.name !== undefined)
                out.name = requireText(b.name, 'Name');
            if (!partial || b.code !== undefined)
                out.code = text(b.code)?.toUpperCase() ?? null;
            if (!partial || b.is_active !== undefined)
                out.is_active = flag(b.is_active);
            return out;
        },
    },
    {
        path: 'states',
        table: 'states',
        label: 'State',
        parent: { column: 'country_id', table: 'countries', label: 'Country' },
        children: [{ table: 'districts', column: 'state_id', noun: 'district' }],
        order: ['name'],
        fields: (b, partial) => {
            const out = {};
            if (!partial || b.name !== undefined)
                out.name = requireText(b.name, 'Name');
            if (!partial || b.code !== undefined)
                out.code = text(b.code)?.toUpperCase() ?? null;
            if (!partial || b.is_active !== undefined)
                out.is_active = flag(b.is_active);
            return out;
        },
    },
    {
        path: 'districts',
        table: 'districts',
        label: 'District',
        parent: { column: 'state_id', table: 'states', label: 'State' },
        order: ['name'],
        fields: (b, partial) => {
            const out = {};
            if (!partial || b.name !== undefined)
                out.name = requireText(b.name, 'Name');
            if (!partial || b.is_active !== undefined)
                out.is_active = flag(b.is_active);
            return out;
        },
    },
];
/** The parent id on a write, checked to exist so a row cannot be orphaned. */
async function parentId(m, body, required) {
    if (!m.parent)
        return null;
    const raw = body[m.parent.column];
    if (raw === undefined || raw === null || raw === '') {
        if (!required)
            return undefined;
        throw badRequest(`${m.parent.label} is required.`);
    }
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0)
        throw badRequest(`${m.parent.label} is not valid.`);
    const found = await db
        .selectFrom(m.parent.table)
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
    if (!found)
        throw notFound(`${m.parent.label} not found.`);
    return id;
}
/** How many rows point at this one, and what to call them. */
async function dependants(m, row) {
    for (const child of m.children ?? []) {
        // enquiry_types is pointed at by a string column, not an id.
        const value = child.column === 'kind' ? row.code : row.id;
        const hit = await db
            .selectFrom(child.table)
            .select('id')
            .where(child.column, '=', value)
            .executeTakeFirst();
        if (hit)
            return child.noun;
    }
    return null;
}
for (const m of MASTERS) {
    const base = `/${m.path}`;
    /**
     * The list. `active=1` narrows it to what a form should offer; the screen
     * that maintains the list asks for everything, because a deactivated row is
     * exactly what somebody opens that screen to bring back.
     */
    masterRoutes.get(base, wrap(async (req, res) => {
        let q = db.selectFrom(m.table).selectAll();
        if (req.query.active === '1')
            q = q.where('is_active', '=', 1);
        if (m.parent && req.query[m.parent.column]) {
            q = q.where(m.parent.column, '=', Number(req.query[m.parent.column]));
        }
        for (const column of m.order)
            q = q.orderBy(column);
        res.json({ data: await q.execute() });
    }));
    masterRoutes.post(base, wrap(async (req, res) => {
        const b = (req.body ?? {});
        const values = {
            ...m.fields(b, false),
            created_at: new Date(),
            updated_at: new Date(),
        };
        const parent = await parentId(m, b, true);
        if (m.parent && parent)
            values[m.parent.column] = parent;
        const result = await db
            .insertInto(m.table)
            .values(values)
            .executeTakeFirstOrThrow()
            .catch((e) => {
            if (e.code === 'ER_DUP_ENTRY')
                throw conflict(`That ${m.label.toLowerCase()} already exists.`);
            throw e;
        });
        res.status(201).json({ data: { id: Number(result.insertId) } });
    }));
    const load = () => wrap(async (req, _res, next) => {
        const row = await db
            .selectFrom(m.table)
            .selectAll()
            .where('id', '=', Number(req.params.id))
            .executeTakeFirst();
        if (!row)
            throw notFound(`${m.label} not found.`);
        req.masterRow = row;
        next();
    });
    masterRoutes.patch(`${base}/:id`, numericId, load(), wrap(async (req, res) => {
        const b = (req.body ?? {});
        const patch = m.fields(b, true);
        const parent = await parentId(m, b, false);
        if (m.parent && parent !== undefined && parent !== null)
            patch[m.parent.column] = parent;
        if (Object.keys(patch).length === 0)
            throw badRequest('Nothing to update.');
        patch.updated_at = new Date();
        await db
            .updateTable(m.table)
            .set(patch)
            .where('id', '=', Number(req.params.id))
            .execute();
        res.json({ data: { id: Number(req.params.id) } });
    }));
    /** Retiring a row. The ordinary end of a master row's life. */
    masterRoutes.patch(`${base}/:id/active`, numericId, load(), wrap(async (req, res) => {
        const is_active = flag((req.body ?? {}).is_active, 0);
        await db
            .updateTable(m.table)
            .set({ is_active, updated_at: new Date() })
            .where('id', '=', Number(req.params.id))
            .execute();
        res.json({ data: { id: Number(req.params.id), is_active } });
    }));
    masterRoutes.delete(`${base}/:id`, numericId, load(), wrap(async (req, res) => {
        const row = req.masterRow;
        const noun = await dependants(m, row);
        if (noun) {
            throw conflict(`This ${m.label.toLowerCase()} is in use by at least one ${noun}. ` +
                'Deactivate it instead, so what already refers to it still reads.');
        }
        await db
            .deleteFrom(m.table)
            .where('id', '=', Number(req.params.id))
            .execute();
        res.json({ data: { deleted: Number(req.params.id) } });
    }));
}
/** The paths this router serves, for the docs check and for tests. */
export const MASTER_PATHS = MASTERS.map((m) => m.path);
