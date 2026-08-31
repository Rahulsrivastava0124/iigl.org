/**
 * The permission menu: what the grants are called, and how they are grouped.
 *
 * There were three copies of this — one on the roles list, one in the roles
 * dialog, one on the role edit page — and they had drifted into three different
 * groupings with three different sets of names for the same fourteen rows.
 * Whatever the menu says has to be the same wherever it is shown, so it is
 * defined once here.
 *
 * The groups mirror the sidebar. A permission is only ever granted so that
 * somebody can use a screen, so the menu that grants it should be shaped like
 * the menu that reaches it — otherwise you are translating between two
 * vocabularies while deciding what somebody may do.
 */

/** The four flags `role_permissions` and `user_permissions` actually store. */
export type Ability = 'view' | 'create' | 'update' | 'delete';

/**
 * Shown as Add and Edit rather than Create and Update: the screens these govern
 * call the same two operations Add and Edit, and the permission screen should
 * not be the one place that names them differently.
 */
export const COLUMNS: { key: Ability; label: string }[] = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Add' },
  { key: 'update', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
];

export const ABILITIES: Ability[] = COLUMNS.map((c) => c.key);

export interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * Plain-English names. The stored values are terse and inconsistent —
 * `product_collection` is order intake, `admin_employee` is head office staff —
 * so nobody should have to infer what a row governs from a column value.
 */
export const NAMES: Record<string, string> = {
  product_collection: 'Order intake',
  report: 'Certificates',
  account: 'Accounts and ledger',
  customer: 'Customers',
  laboratory: 'Laboratories',
  employee_management: 'Employees',
  admin_employee: 'Head office employees',
  visitor_book: 'Visitor book',
  website_home: 'Home page',
  website_blog: 'Blog',
  website_contact: 'Contact',
  website_enquiry: 'Enquiries',
  website_education: 'Education',
  website_report: 'Certificate lookup',
};

export const nameFor = (action: string) =>
  NAMES[action] ?? action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** The sidebar groups, and which grants belong to each. */
export const MENU: { title: string; actions: string[] }[] = [
  { title: 'Order Management', actions: ['product_collection'] },
  { title: 'Certificates', actions: ['report'] },
  { title: 'Account', actions: ['account'] },
  { title: 'Customer', actions: ['customer'] },
  { title: 'Laboratory', actions: ['laboratory'] },
  { title: 'Employee Management', actions: ['employee_management', 'admin_employee'] },
  { title: 'Enquiry', actions: ['visitor_book', 'website_enquiry'] },
  {
    title: 'Website Setup',
    actions: ['website_home', 'website_blog', 'website_contact', 'website_education', 'website_report'],
  },
];

export interface Section {
  title: string;
  rows: Permission[];
}

/**
 * Groups the rows for display.
 *
 * Anything not named in `MENU` falls into "Other" rather than disappearing: a
 * permission added to the database later must still be grantable, and a menu
 * that silently drops what it does not recognise is how a grant goes missing
 * without anyone noticing.
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

/** How many of a set's flags are granted, out of how many there are. */
export function countOf(rows: Permission[]) {
  return {
    granted: rows.reduce((n, r) => n + ABILITIES.filter((a) => r[a]).length, 0),
    total: rows.length * ABILITIES.length,
  };
}

export const allOf = (row: Permission) => ABILITIES.every((a) => row[a]);
export const anyOf = (row: Permission) => ABILITIES.some((a) => row[a]);
