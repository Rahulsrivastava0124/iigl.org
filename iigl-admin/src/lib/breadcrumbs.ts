import { useLocation, useParams } from 'react-router-dom';
import { useFetch } from './useFetch';

/**
 * Breadcrumbs, derived from the route.
 *
 * The shell renders these once, above every page, and no page renders its own.
 *
 * Two rules make the difference between a trail and decoration:
 *
 *   - every crumb but the last is a link, and it goes somewhere real. A crumb
 *     that is not clickable, or that links to a route that does not exist, is
 *     worse than no crumb;
 *   - a record shows its name, not its id. `Order Management › 202608-942258`
 *     tells you where you are; `Order Management › 9612` does not.
 */

export interface Crumb {
  label: string;
  /** Absent on the last crumb, which is where you already are. */
  to?: string;
}

/** The screens that own a top-level path, and what to call them. */
const SECTIONS: Record<string, string> = {
  orders: 'Order Management',
  reports: 'Certificates',
  transactions: 'Account',
  attendance: 'Attendance',
  laboratories: 'Laboratory',
  staff: 'Employee Management',
  profile: 'Your profile',
  categories: 'Report Master',
  attributes: 'Report Master',
  pricing: 'Price Setup',
  content: 'Website Setup',
  roles: 'Roles & Permissions',
  customers: 'Customer',
};

/**
 * Menu entries that deep-link into a section rather than owning a path of their
 * own. The query decides the last crumb, so the trail names the entry the
 * person actually clicked rather than the screen it happens to share.
 */
const VIEWS: Record<string, Record<string, string>> = {
  orders: {
    'status=preparing': 'In Progress',
    'status=delivered': 'Paid & Delivered',
    'dues=1': 'Dues Order',
  },
  categories: { 'tab=sub': 'Sub Categories' },
  attributes: { 'tab=values': 'Attribute Values' },
  pricing: { 'scope=laboratory': 'Laboratory Prices' },
  transactions: { 'status=0': 'Commission Approval', 'view=ledger': 'Ledger' },
  customers: { 'tab=unregistered': 'Not Registered', 'tab=verifiers': 'Verifiers' },
  content: {
    'tab=pages': 'Pages',
    'tab=types': 'Report Types',
    'tab=articles': 'Blog',
    'tab=branches': 'Branches',
    'tab=banners': 'Banners',
  },
};

/** Child routes whose last segment is a word rather than an id. */
const LEAVES: Record<string, string> = {
  'reports/new': 'Issue a Certificate',
  'orders/new': 'Collect New',
};

/** Sections with a detail route, and where to read the record's name from. */
const RECORD_PATH: Record<string, (id: string) => string> = {
  orders: (id) => `/orders/${id}`,
  reports: (id) => `/reports/${id}`,
};

export function useBreadcrumbs(portal: string): Crumb[] {
  const location = useLocation();
  const params = useParams();

  const segments = location.pathname.split('/').filter(Boolean);
  const section = segments[0] ?? '';
  const child = segments[1];
  const id = params.id;

  // Resolved unconditionally: a hook cannot live inside a branch. When the
  // route is not a record, the path is null and useFetch does nothing.
  const recordPath = id && RECORD_PATH[section] ? RECORD_PATH[section](id) : null;
  const record = useFetch<{ data: { order_no?: string; report_no?: string } }>(recordPath);
  const recordName = record.data?.data.order_no ?? record.data?.data.report_no ?? `#${id}`;

  // The dashboard is the root. "Super Admin › Dashboard" says the same thing
  // twice, so the trail stops at one crumb.
  if (segments.length === 0) return [{ label: 'Dashboard' }];

  const root: Crumb = { label: portal === 'team' ? 'Team' : 'Super Admin', to: '/' };
  const sectionLabel = SECTIONS[section];

  // An unknown path. The router sends these to the dashboard, so the trail
  // should not claim a section that does not exist.
  if (!sectionLabel) return [{ label: 'Dashboard' }];

  // A deep-linked view: /categories?tab=sub is Product Master › Sub Category.
  const query = new URLSearchParams(location.search);
  for (const [key, label] of Object.entries(VIEWS[section] ?? {})) {
    const [name, value] = key.split('=');
    if (query.get(name) === value) {
      return [root, { label: sectionLabel, to: `/${section}` }, { label }];
    }
  }

  const leaf = LEAVES[`${section}/${child}`];
  if (leaf) {
    return [root, { label: sectionLabel, to: `/${section}` }, { label: leaf }];
  }

  if (id) {
    return [root, { label: sectionLabel, to: `/${section}` }, { label: recordName }];
  }

  return [root, { label: sectionLabel }];
}
