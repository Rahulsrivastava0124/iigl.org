/**
 * Which door someone came in by.
 *
 * One door per role, named after the role rather than after the software:
 *
 *   super.iigl.org   super admin — IIGL head office            role 1
 *   admin.iigl.org   admin — a laboratory owner                role 2
 *   team.iigl.org    team — their staff                        roles 3 to 5
 *
 * The bare domain is the head office door, because that is who opens the panel
 * without being told an address.
 *
 * Detected from the host first, so the subdomains work in production, and from
 * the first path segment as well — `/super`, `/admin`, `/team` — so all three
 * can be used locally without touching DNS or a hosts file.
 *
 * This decides which sign-in screen somebody sees and which accounts it accepts.
 * It is **not** a permission boundary: the API checks the role on every request,
 * and would still refuse a laboratory the catalogue if it signed in at the head
 * office address.
 */

export type Portal = 'super' | 'admin' | 'team';

export interface PortalConfig {
  id: Portal;
  title: string;
  subtitle: string;
  /** Roles this door accepts. */
  admits: (roleId: number) => boolean;
  /**
   * Shown when a sign-in is refused here — wrong credentials, or the right
   * ones for a different door. One sentence for both, deliberately: see
   * `REFUSED`.
   */
  wrongDoor: string;
}

/**
 * What a refused sign-in says, whatever the reason.
 *
 * It used to name the door the credentials *did* belong to — "This sign-in is
 * for staff. A laboratory signs in at the admin address…" — which is a
 * different sentence from the one a wrong password gets, and the difference is
 * the disclosure: it confirms that the number and password were right, and
 * which kind of account they open. Guessing then costs three attempts instead
 * of one, and each refusal is an answer.
 *
 * So the wrong door says exactly what a wrong password says. `/auth/login`
 * already reasons this way for its own two cases — a missing account and a bad
 * password are one message there so the endpoint cannot be used to enumerate
 * numbers — and this is the third case joining them.
 *
 * Somebody genuinely at the wrong entrance is not left stuck: the footer under
 * the card names the other two doors on every load, to everybody, and tells
 * them nothing about any particular credential.
 */
const REFUSED = 'That mobile number and password do not match.';

export const PORTALS: Record<Portal, PortalConfig> = {
  super: {
    id: 'super',
    title: 'IIGL Super Admin',
    subtitle: 'Head office sign-in.',
    admits: (r) => r === ROLE.SUPER,
    wrongDoor: REFUSED,
  },
  admin: {
    id: 'admin',
    title: 'IIGL Admin',
    subtitle: 'Laboratory sign-in.',
    admits: (r) => r === ROLE.ADMIN,
    wrongDoor: REFUSED,
  },
  team: {
    id: 'team',
    title: 'IIGL Team',
    subtitle: 'Staff sign-in.',
    // Lab employee, manager, office boy — everyone who works for somebody
    // else. A laboratory owner is not staff and has their own door.
    admits: (r) => r >= ROLE.TEAM,
    wrongDoor: REFUSED,
  },
};

/** Where each door tells the others to go, for the line under the sign-in card. */
export const OTHER_DOORS: Record<Portal, string> = {
  super: 'Laboratories sign in at the admin address, staff at the team address.',
  admin: 'Staff sign in at the team address; head office at the super admin address.',
  team: 'Laboratories sign in at the admin address; head office at the super admin address.',
};

/**
 * The path prefix for this portal.
 *
 * Empty for a subdomain, and empty for the bare domain, which is the head
 * office door — a basename is only needed when the door came from the path.
 */
export function basenameFor(portal: Portal): string {
  return window.location.pathname.startsWith(`/${portal}`) ? `/${portal}` : '';
}

export function currentPortal(): Portal {
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith('super.')) return 'super';
  if (host.startsWith('admin.')) return 'admin';
  if (host.startsWith('team.')) return 'team';

  const first = window.location.pathname.split('/')[1]?.toLowerCase();
  if (first === 'super') return 'super';
  if (first === 'admin') return 'admin';
  if (first === 'team') return 'team';

  // The bare domain. Head office is who arrives here without an address.
  return 'super';
}

/**
 * The roles as the data numbers them.
 *
 *   1  super admin   head office
 *   2  admin         a laboratory. **The same account** — a laboratory user is
 *                    its admin, so there is no third kind of person here.
 *   3  team          their staff (4 and 5 are older team variants).
 *
 * A `roleId` of `null` is not a role at all: it is somebody whose permissions
 * were granted to them one row at a time.
 */
export const ROLE = { SUPER: 1, ADMIN: 2, LAB: 2, TEAM: 3 } as const;

/**
 * Role narrowing, named.
 *
 * These say what the number means; they are not permission decisions — a write
 * control needs `can()` from the matrix as well. An administrator runs the
 * business, a laboratory runs a counter, and everyone else works at one.
 */
/** Head office. */
export const isSuper = (user?: { roleId: number | null } | null) => user?.roleId === ROLE.SUPER;

/**
 * A laboratory — which is to say its admin. `isAdmin` and `isLab` are the same
 * test under two names because they are the same account; both exist so a call
 * site can read the way the person writing it thinks about the user.
 */
export const isAdmin = (user?: { roleId: number | null } | null) => user?.roleId === ROLE.ADMIN;
export const isLab = isAdmin;
/** Nobody's role: everything they can do was granted to them one row at a time. */
export const hasNoRole = (user?: { roleId: number | null } | null) =>
  user != null && user.roleId == null;

/** What the sidebar and the breadcrumb root call each door. */
export const PORTAL_LABEL: Record<Portal, string> = {
  super: 'Super Admin',
  admin: 'Administration',
  team: 'Team',
};

export const ROLE_NAMES: Record<number, string> = {
  1: 'Super admin',
  2: 'Admin — laboratory',
  3: 'Team',
  4: 'Manager',
  5: 'Office boy',
};
