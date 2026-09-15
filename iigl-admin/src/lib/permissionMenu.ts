/**
 * The permission menu: what the grants are called, how they are grouped, and
 * which boxes mean anything.
 *
 * Defined once so the role dialog, the role page and one employee's own
 * permissions all say the same thing about the same row.
 *
 * The API decides what a row is: it sends only the permissions the role or
 * the employee can carry, each with `description` (what it opens),
 * `abilities` (which of the four boxes it uses) and `applies_to` (whose
 * employees can be given it). The screens draw what they are sent.
 */

/** The four flags `role_permissions` and `user_permissions` actually store. */
export type Ability = 'view' | 'create' | 'update' | 'delete';

/** The four boxes, in the order they are read: Create, Read, Update, Delete. */
export const COLUMNS: { key: Ability; label: string }[] = [
  { key: 'create', label: 'Create' },
  { key: 'view', label: 'Read' },
  { key: 'update', label: 'Update' },
  { key: 'delete', label: 'Delete' },
];

export const ABILITIES: Ability[] = COLUMNS.map((c) => c.key);

export type StaffKind = 'laboratory' | 'head_office';

export interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  /** From the API: the name to show. */
  label?: string;
  /** From the API: what each box lets somebody do. */
  description?: string;
  /** From the API: the boxes this permission uses. Absent means all four. */
  abilities?: Ability[];
  /** From the API: whose employees can be given it. */
  applies_to?: StaffKind[];
}

/** Whether a box means anything for this permission. */
export const uses = (row: Permission, ability: Ability) => !row.abilities || row.abilities.includes(ability);

/** The boxes a row uses. */
export const usable = (row: Permission) => ABILITIES.filter((a) => uses(row, a));

/**
 * A permission by the sub-menu entries it opens, as the sidebar names them.
 * Several entries share one permission — Registered and Not Registered are both
 * `customer` — so a row lists all of them rather than pretending each is its own.
 */
export const NAMES: Record<string, string> = {
  product_collection: 'In Progress · Delivered · Dues Order',
  report: 'All Reports List',
  customer: 'All Customers · Registered · Not Registered',
  laboratory: 'View Franchise',
  website_home: 'Banners · Customers · Branches · Reviews · Certificates · Course Gallery · Testimonials',
  website_report: 'Report Types',
  website_blog: 'Blog',
  website_enquiry: 'Enquiry',
  visitor_book: "Ask Me · Visitor's Diary · Contact Us · Complaints",
};

export const nameFor = (action: string, row?: Permission) =>
  NAMES[action] ?? row?.label ?? action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const SIDE: Record<StaffKind, string> = {
  laboratory: 'Laboratory staff',
  head_office: 'Head office staff',
};

/** The groups: the sidebar menus, in sidebar order, each over its sub-menu rows. */
export const MENU: { title: string; actions: string[] }[] = [
  { title: 'Orders', actions: ['product_collection'] },
  { title: 'Report', actions: ['report'] },
  { title: 'Customer', actions: ['customer'] },
  { title: 'Laboratory', actions: ['laboratory'] },
  { title: 'Website Setup', actions: ['website_home', 'website_report', 'website_blog'] },
  { title: 'Student', actions: ['website_enquiry'] },
  { title: 'Enquiry', actions: ['visitor_book'] },
];

export interface Section {
  title: string;
  rows: Permission[];
}

/**
 * Groups the rows for display. A row the menu does not name falls into
 * "Other" rather than disappearing, so a permission added later is still
 * grantable.
 */
export function sections(rows: Permission[]): Section[] {
  const placed = new Set(MENU.flatMap((g) => g.actions));
  const known = MENU.map((g) => ({
    title: g.title,
    rows: g.actions
      .map((a) => rows.find((r) => r.action_type === a))
      .filter((r): r is Permission => Boolean(r)),
  })).filter((g) => g.rows.length > 0);
  const rest = rows.filter((r) => !placed.has(r.action_type));
  return rest.length ? [...known, { title: 'Other', rows: rest }] : known;
}

/** How many of a set's usable flags are granted, out of how many there are. */
export function countOf(rows: Permission[]) {
  return {
    granted: rows.reduce((n, r) => n + usable(r).filter((a) => r[a]).length, 0),
    total: rows.reduce((n, r) => n + usable(r).length, 0),
  };
}

export const allOf = (row: Permission) => usable(row).every((a) => row[a]);
export const anyOf = (row: Permission) => usable(row).some((a) => row[a]);
