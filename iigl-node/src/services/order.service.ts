import { db } from '../db/index.js';
import { badRequest, conflict } from '../lib/errors.js';
import type { SessionUser } from '../middleware/auth.js';

/** Matches the Laravel format: YYYYMM-<six digits>. */
function makeOrderNo(): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${ym}-${Math.floor(100000 + Math.random() * 900000)}`;
}

/** dd-mm-yyyy, the format already stored in orders.order_date. */
export function ddmmyyyy(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/**
 * The filter that keeps deleted orders out of everything.
 *
 * Deleting an order sets `orders.deleted_at` rather than removing the row — see
 * migration 030 — so every read has to say it wants the live ones. There are
 * thirty query sites across ten files and the schema has no foreign keys, so a
 * read that forgets does not fail: it quietly puts a deleted order back into a
 * list, a count or a sum, and nothing says so.
 *
 * Written once here, applied at each of those sites, and `npm run
 * check:soft-delete` fails the build if a query goes round it.
 *
 * Two shapes, because a query reaches `orders` two ways:
 *
 *   `live(q)`        when `orders` is what the query selects from
 *   `liveJoined(q)`  when `orders` arrived through a join, and the column has
 *                    to be named `orders.deleted_at` to be unambiguous
 */
export const live = <Q extends { where: any }>(q: Q): Q => q.where('deleted_at', 'is', null) as Q;

export const liveJoined = <Q extends { where: any }>(q: Q): Q =>
  q.where('orders.deleted_at', 'is', null) as Q;

export interface OrderItemInput {
  category_id: number;
  qty: number;
  smart_card: boolean;
  classic_card: boolean;
}

export interface CreateOrderInput {
  customer_name: string;
  mobile: string;
  alt_mobile?: string | null;
  email?: string | null;
  gst?: string | null;
  address?: string | null;
  dues_date?: string | null;
  assigned_to?: number | null;
  show_name_in_card?: number;
  show_image_in_card?: number;
  show_name_input?: string | null;
  /** The picture to print on the card, when one was handed over. */
  show_image_in_card_file?: string | null;
  items: OrderItemInput[];
}

export function validateOrderInput(body: unknown): CreateOrderInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!b.customer_name) throw badRequest('Customer name is required.');
  if (!b.mobile) throw badRequest('Mobile number is required.');

  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw badRequest('Add at least one item to the order.');

  const parsed: OrderItemInput[] = items.map((raw, i) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const qty = Number(it.qty);
    if (!it.category_id) throw badRequest(`Item ${i + 1} is missing a category.`);
    if (!Number.isInteger(qty) || qty < 1) throw badRequest(`Item ${i + 1} needs a quantity of at least 1.`);
    if (!it.smart_card && !it.classic_card) {
      throw badRequest(`Item ${i + 1} must have a smart card, a classic card, or both.`);
    }
    return {
      category_id: Number(it.category_id),
      qty,
      smart_card: Boolean(it.smart_card),
      classic_card: Boolean(it.classic_card),
    };
  });

  return {
    customer_name: String(b.customer_name),
    mobile: String(b.mobile),
    alt_mobile: b.alt_mobile ? String(b.alt_mobile) : null,
    email: b.email ? String(b.email) : null,
    gst: b.gst ? String(b.gst) : null,
    address: b.address ? String(b.address) : null,
    dues_date: b.dues_date ? String(b.dues_date) : null,
    assigned_to: b.assigned_to ? Number(b.assigned_to) : null,
    show_name_in_card: b.show_name_in_card ? 1 : 0,
    show_image_in_card: b.show_image_in_card ? 1 : 0,
    show_name_input: b.show_name_input ? String(b.show_name_input) : null,
    show_image_in_card_file: b.show_image_in_card_file ? String(b.show_image_in_card_file) : null,
    items: parsed,
  };
}

/**
 * Creates an order and its details in one transaction. The Laravel version
 * writes them in two unguarded statements, which is why orphaned orders with
 * no detail rows exist in the data.
 */
export async function createOrder(user: SessionUser, input: CreateOrderInput) {
  if (user.labId === null) {
    throw badRequest('Your account is not linked to a laboratory, so it cannot take orders.');
  }
  const labId = user.labId;

  return db.transaction().execute(async (trx) => {
    const today = ddmmyyyy();
    let orderId: number | null = null;

    // order_no is random, so a collision is possible. Retry rather than
    // returning a duplicate number to the customer.
    for (let attempt = 0; attempt < 5 && orderId === null; attempt++) {
      const orderNo = makeOrderNo();
      // soft-delete-exempt: reads deleted orders too, on purpose. A number
      // belonging to a deleted order is still spent — the row is there, its
      // certificates may be there — and handing the same number to a new
      // customer would leave two orders answering to it.
      const clash = await trx
        .selectFrom('orders')
        .select('id')
        .where('order_no', '=', orderNo)
        .executeTakeFirst();
      if (clash) continue;

      const result = await trx
        .insertInto('orders')
        .values({
          order_no: orderNo,
          customer_name: input.customer_name,
          mobile: input.mobile,
          alt_mobile: input.alt_mobile,
          email: input.email,
          gst: input.gst,
          address: input.address,
          dues_date: input.dues_date,
          lab_id: labId,
          received_by: user.id,
          assigned_to: input.assigned_to,
          assigned_date: today,
          order_date: today,
          status: 'preparing',
          show_name_in_card: input.show_name_in_card ?? 0,
          show_image_in_card: input.show_image_in_card ?? 0,
          show_name_input: input.show_name_input,
          show_image_in_card_file: input.show_image_in_card_file,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .executeTakeFirst();

      orderId = Number(result.insertId);
    }

    if (orderId === null) throw conflict('Could not allocate an order number. Try again.');

    await trx
      .insertInto('order_details')
      .values(
        input.items.map((it) => ({
          order_id: orderId!,
          category_id: it.category_id,
          qty: it.qty,
          smart_card: it.smart_card ? 1 : 0,
          classic_card: it.classic_card ? 1 : 0,
          created_at: new Date(),
          updated_at: new Date(),
        })),
      )
      .execute();

    return orderId;
  });
}

export interface UpdateOrderInput {
  customer_name?: string;
  mobile?: string;
  alt_mobile?: string | null;
  email?: string | null;
  gst?: string | null;
  address?: string | null;
  dues_date?: string | null;
  /** Who the work is with. Reassigning it is an amendment like any other. */
  assigned_to?: number | null;
  show_name_in_card?: number;
  show_image_in_card?: number;
  show_name_input?: string | null;
  show_image_in_card_file?: string | null;
  /** When present, replaces the item list. An item with an id is updated. */
  items?: Array<OrderItemInput & { id?: number }>;
}

export function validateUpdateOrderInput(body: unknown): UpdateOrderInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: UpdateOrderInput = {};

  if (b.customer_name !== undefined) {
    if (!b.customer_name) throw badRequest('Customer name cannot be blank.');
    out.customer_name = String(b.customer_name);
  }
  if (b.mobile !== undefined) {
    if (!b.mobile) throw badRequest('Mobile number cannot be blank.');
    out.mobile = String(b.mobile);
  }
  for (const key of [
    'alt_mobile',
    'email',
    'gst',
    'address',
    'dues_date',
    'show_name_input',
    'show_image_in_card_file',
  ] as const) {
    if (b[key] !== undefined) out[key] = b[key] == null ? null : String(b[key]);
  }
  if (b.assigned_to !== undefined) {
    out.assigned_to = b.assigned_to === null || b.assigned_to === '' ? null : Number(b.assigned_to);
  }
  if (b.show_name_in_card !== undefined) out.show_name_in_card = b.show_name_in_card ? 1 : 0;
  if (b.show_image_in_card !== undefined) out.show_image_in_card = b.show_image_in_card ? 1 : 0;

  if (b.items !== undefined) {
    if (!Array.isArray(b.items) || b.items.length === 0) {
      throw badRequest('An order must keep at least one item.');
    }
    out.items = b.items.map((raw, i) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      const qty = Number(it.qty);
      if (!it.category_id) throw badRequest(`Item ${i + 1} is missing a category.`);
      if (!Number.isInteger(qty) || qty < 1) throw badRequest(`Item ${i + 1} needs a quantity of at least 1.`);
      if (!it.smart_card && !it.classic_card) {
        throw badRequest(`Item ${i + 1} must have a smart card, a classic card, or both.`);
      }
      return {
        ...(it.id ? { id: Number(it.id) } : {}),
        category_id: Number(it.category_id),
        qty,
        smart_card: Boolean(it.smart_card),
        classic_card: Boolean(it.classic_card),
      };
    });
  }

  if (Object.keys(out).length === 0) throw badRequest('Nothing to update.');
  return out;
}

/**
 * Amends an order. Items with an id are updated in place, items without one are
 * added, and an existing item left out of the list is removed — but only if no
 * certificate has been issued against it, and never below the quantity already
 * certified. The Laravel version applies neither guard, so reducing a quantity
 * can strand issued certificates.
 */
export async function updateOrder(orderId: number, input: UpdateOrderInput) {
  return db.transaction().execute(async (trx) => {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    for (const key of [
      'customer_name',
      'mobile',
      'alt_mobile',
      'email',
      'gst',
      'address',
      'dues_date',
      'show_name_input',
      'show_name_in_card',
      'show_image_in_card',
      'show_image_in_card_file',
      'assigned_to',
    ] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }

    if (Object.keys(patch).length > 1) {
      await trx.updateTable('orders').set(patch as never).where('id', '=', orderId).execute();
    }

    if (!input.items) return orderId;

    const existing = await trx
      .selectFrom('order_details')
      .select(['id', 'qty'])
      .where('order_id', '=', orderId)
      .execute();

    const certified = new Map<number, number>();
    if (existing.length) {
      const counts = await trx
        .selectFrom('reports')
        .select(['order_detail_id', trx.fn.countAll().as('n')])
        .where(
          'order_detail_id',
          'in',
          existing.map((e) => String(e.id)),
        )
        .groupBy('order_detail_id')
        .execute();
      for (const c of counts) certified.set(Number(c.order_detail_id), Number(c.n));
    }

    const keptIds = new Set(input.items.filter((i) => i.id).map((i) => Number(i.id)));

    for (const row of existing) {
      if (keptIds.has(Number(row.id))) continue;
      const issued = certified.get(Number(row.id)) ?? 0;
      if (issued > 0) {
        throw conflict(
          `Item ${row.id} cannot be removed: ${issued} certificate${issued === 1 ? ' has' : 's have'} already been issued against it.`,
        );
      }
      await trx.deleteFrom('order_details').where('id', '=', Number(row.id)).execute();
    }

    for (const item of input.items) {
      if (item.id) {
        const issued = certified.get(item.id) ?? 0;
        if (item.qty < issued) {
          throw conflict(
            `Item ${item.id} cannot drop to ${item.qty}: ${issued} certificates have already been issued.`,
          );
        }
        await trx
          .updateTable('order_details')
          .set({
            category_id: item.category_id,
            qty: item.qty,
            smart_card: item.smart_card ? 1 : 0,
            classic_card: item.classic_card ? 1 : 0,
            updated_at: new Date(),
          })
          .where('id', '=', item.id)
          .where('order_id', '=', orderId)
          .execute();
      } else {
        await trx
          .insertInto('order_details')
          .values({
            order_id: orderId,
            category_id: item.category_id,
            qty: item.qty,
            smart_card: item.smart_card ? 1 : 0,
            classic_card: item.classic_card ? 1 : 0,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .execute();
      }
    }

    return orderId;
  });
}
