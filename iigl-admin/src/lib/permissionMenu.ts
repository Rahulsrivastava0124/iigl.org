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

/**
 * Shown as Add and Edit rather than Create and Update: the screens these govern
 * call the same two operations Add and Edit.
 */
export const COLUMNS: { key: Ability; label: string }[] = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Add' },
  { key: 'update', label: 'Edit' },
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

/** Plain-English names, for a row the API did not label. */
export const NAMES: Record<string, string> = {
  product_collection: 'Orders',
  report: 'Certificates',
  customer: 'Customers',
  laboratory: 'Laboratories',
  visitor_book: 'Enquiry book',
  website_enquiry: 'Student enquiries',
  website_home: 'Website — banners, pages, branches, customers',
  website_report: 'Website — report types',
  website_blog: 'Website — blog',
};

export const nameFor = (action: string, row?: Permission) =>
  NAMES[action] ?? row?.label ?? action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const SIDE: Record<StaffKind, string> = {
  laboratory: 'Laboratory staff',
  head_office: 'Head office staff',
};

/** The groups, shaped like the menus the permissions open. */
export const MENU: { title: string; actions: string[] }[] = [
  { title: 'Counter — orders and certificates', actions: ['product_collection', 'report'] },
  { title: 'Customers', actions: ['customer'] },
  { title: 'Laboratories', actions: ['laboratory'] },
  { title: 'Enquiries', actions: ['visitor_book', 'website_enquiry'] },
  { title: 'Website Setup', actions: ['website_home', 'website_report', 'website_blog'] },
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
