import type { RequestHandler } from 'express';
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

const text = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim());

const requireText = (v: unknown, field: string): string => {
  const s = text(v);
  if (!s) throw badRequest(`${field} is required.`);
  return s;
};

const flag = (v: unknown, fallback = 1): number => {
  if (v === undefined) return fallback;
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
};

/** Where a row's children live, so deleting a parent with children is refused. */
interface ChildTable {
  table: string;
  column: string;
  /** What to call them in the refusal. */
  noun: string;
}

interface Master {
  /** The path segment, and what the panel calls it. */
  path: string;
  table: string;
  /** Singular, for messages: "Country not found." */
  label: string;
  /** The parent whose id every row carries, when it has one. */
  parent?: { column: string; table: string; label: string };
  /** Everything that points at a row of this list. */
  children?: ChildTable[];
  /** Reads the writable columns off a request body. `partial` is a PATCH. */
  fields: (body: Record<string, unknown>, partial: boolean) => Record<string, unknown>;
  /** How the list comes back. */
  order: string[];
}

const MASTERS: Master[] = [
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
      const out: Record<string, unknown> = {};
      if (!partial || b.name !== undefined) out.name = requireText(b.name, 'Name');
      if (!partial || b.percent !== undefined) {
        const n = Number(b.percent ?? 0);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          throw badRequest('Percent must be a number between 0 and 100.');
        }
        out.percent = n;
      }
      if (!partial || b.is_active !== undefined) out.is_active = flag(b.is_active);
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
      const out: Record<string, unknown> = {};
      // The code is what `enquiries.kind` holds, so it is set once and never
      // edited: renaming it orphans every enquiry filed under the old one.
      if (!partial) {
        const code = requireText(b.code, 'Code')
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, '_');
        if (!code) throw badRequest('Code must contain a letter or a digit.');
        out.code = code;
      }
      if (!partial || b.label !== undefined) out.label = requireText(b.label, 'Label');
      if (!partial || b.sort !== undefined) out.sort = Number(b.sort ?? 0) || 0;
      if (!partial || b.is_active !== undefined) out.is_active = flag(b.is_active);
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
      const out: Record<string, unknown> = {};
      if (!partial || b.name !== undefined) out.name = requireText(b.name, 'Name');
      if (!partial || b.code !== undefined) out.code = text(b.code)?.toUpperCase() ?? null;
      if (!partial || b.is_active !== undefined) out.is_active = flag(b.is_active);
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
      const out: Record<string, unknown> = {};
      if (!partial || b.name !== undefined) out.name = requireText(b.name, 'Name');
      if (!partial || b.code !== undefined) out.code = text(b.code)?.toUpperCase() ?? null;
      if (!partial || b.is_active !== undefined) out.is_active = flag(b.is_active);
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
      const out: Record<string, unknown> = {};
      if (!partial || b.name !== undefined) out.name = requireText(b.name, 'Name');
      if (!partial || b.is_active !== undefined) out.is_active = flag(b.is_active);
      return out;
    },
  },
];

/** The parent id on a write, checked to exist so a row cannot be orphaned. */
async function parentId(m: Master, body: Record<string, unknown>, required: boolean) {
  if (!m.parent) return null;
  const raw = body[m.parent.column];
  if (raw === undefined || raw === null || raw === '') {
    if (!required) return undefined;
    throw badRequest(`${m.parent.label} is required.`);
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`${m.parent.label} is not valid.`);

  const found = await db
    .selectFrom(m.parent.table as never)
    .select('id' as never)
    .where('id' as never, '=', id as never)
    .executeTakeFirst();
  if (!found) throw notFound(`${m.parent.label} not found.`);
  return id;
}

/** How many rows point at this one, and what to call them. */
async function dependants(m: Master, row: Record<string, unknown>) {
  for (const child of m.children ?? []) {
    // enquiry_types is pointed at by a string column, not an id.
    const value = child.column === 'kind' ? row.code : row.id;
    const hit = await db
      .selectFrom(child.table as never)
      .select('id' as never)
      .where(child.column as never, '=', value as never)
      .executeTakeFirst();
    if (hit) return child.noun;
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
  masterRoutes.get(
    base,
    wrap(async (req, res) => {
      let q = db.selectFrom(m.table as never).selectAll();
      if (req.query.active === '1') q = q.where('is_active' as never, '=', 1 as never);
      if (m.parent && req.query[m.parent.column]) {
        q = q.where(m.parent.column as never, '=', Number(req.query[m.parent.column]) as never);
      }
      for (const column of m.order) q = q.orderBy(column as never);
      res.json({ data: await q.execute() });
    }),
  );

  masterRoutes.post(
    base,
    wrap(async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const values: Record<string, unknown> = {
        ...m.fields(b, false),
        created_at: new Date(),
        updated_at: new Date(),
      };
      const parent = await parentId(m, b, true);
      if (m.parent && parent) values[m.parent.column] = parent;

      const result = await db
        .insertInto(m.table as never)
        .values(values as never)
        .executeTakeFirstOrThrow()
        .catch((e: { code?: string }) => {
          if (e.code === 'ER_DUP_ENTRY') throw conflict(`That ${m.label.toLowerCase()} already exists.`);
          throw e;
        });

      res.status(201).json({ data: { id: Number(result.insertId) } });
    }),
  );

  const load = (): RequestHandler =>
    wrap(async (req, _res, next) => {
      const row = await db
        .selectFrom(m.table as never)
        .selectAll()
        .where('id' as never, '=', Number(req.params.id) as never)
        .executeTakeFirst();
      if (!row) throw notFound(`${m.label} not found.`);
      (req as unknown as { masterRow: Record<string, unknown> }).masterRow = row as never;
      next();
    });

  masterRoutes.patch(
    `${base}/:id`,
    numericId,
    load(),
    wrap(async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = m.fields(b, true);

      const parent = await parentId(m, b, false);
      if (m.parent && parent !== undefined && parent !== null) patch[m.parent.column] = parent;

      if (Object.keys(patch).length === 0) throw badRequest('Nothing to update.');
      patch.updated_at = new Date();

      await db
        .updateTable(m.table as never)
        .set(patch as never)
        .where('id' as never, '=', Number(req.params.id) as never)
        .execute();

      res.json({ data: { id: Number(req.params.id) } });
    }),
  );

  /** Retiring a row. The ordinary end of a master row's life. */
  masterRoutes.patch(
    `${base}/:id/active`,
    numericId,
    load(),
    wrap(async (req, res) => {
      const is_active = flag((req.body ?? {}).is_active, 0);
      await db
        .updateTable(m.table as never)
        .set({ is_active, updated_at: new Date() } as never)
        .where('id' as never, '=', Number(req.params.id) as never)
        .execute();
      res.json({ data: { id: Number(req.params.id), is_active } });
    }),
  );

  masterRoutes.delete(
    `${base}/:id`,
    numericId,
    load(),
    wrap(async (req, res) => {
      const row = (req as unknown as { masterRow: Record<string, unknown> }).masterRow;
      const noun = await dependants(m, row);
      if (noun) {
        throw conflict(
          `This ${m.label.toLowerCase()} is in use by at least one ${noun}. ` +
            'Deactivate it instead, so what already refers to it still reads.',
        );
      }
      await db
        .deleteFrom(m.table as never)
        .where('id' as never, '=', Number(req.params.id) as never)
        .execute();
      res.json({ data: { deleted: Number(req.params.id) } });
    }),
  );
}

/** The paths this router serves, for the docs check and for tests. */
export const MASTER_PATHS = MASTERS.map((m) => m.path);
