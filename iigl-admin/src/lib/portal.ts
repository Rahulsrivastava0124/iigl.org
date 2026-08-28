/**
 * Which door someone came in by.
 *
 * The panel has three entry points and each admits a different set of roles:
 *
 *   default   the admin panel — administrators
 *   super.    super administrator sign-in
 *   team.     laboratories and their staff only
 *
 * Detected from the host first, so `super.iigl.org` and `team.iigl.org` work in
 * production, and from the first path segment as well, so `/super` and `/team`
 * work locally without touching DNS or hosts files.
 *
 * This decides which sign-in screen someone sees and which accounts it accepts.
 * It is not a permission boundary — the API enforces what each role may do on
 * every request, and always would even if someone signed in by another door.
 */

export type Portal = 'admin' | 'super' | 'team';

export interface PortalConfig {
  id: Portal;
  title: string;
  subtitle: string;
  /** Roles this door accepts. */
  admits: (roleId: number) => boolean;
  /** Shown when the right credentials arrive at the wrong door. */
  wrongDoor: string;
}

export const PORTALS: Record<Portal, PortalConfig> = {
  admin: {
    id: 'admin',
    title: 'IIGL Admin',
    subtitle: 'Sign in with your registered mobile number.',
    admits: (r) => r === 1,
    wrongDoor: 'This sign-in is for administrators. Laboratory and staff accounts sign in at the team address.',
  },
  super: {
    id: 'super',
    title: 'IIGL Super Admin',
    subtitle: 'Administrator sign-in.',
    admits: (r) => r === 1,
    wrongDoor: 'This sign-in is for administrators only.',
  },
  team: {
    id: 'team',
    title: 'IIGL Team',
    subtitle: 'Laboratory and staff sign-in.',
    // Every role above administrator: laboratory, lab employee, manager,
    // office boy. Matches the API guard, which admits role_id > 1 here.
    admits: (r) => r >= 2,
    wrongDoor: 'This sign-in is for laboratories and staff. Administrators sign in at the admin address.',
  },
};

/** The path prefix for this portal, '' for the default admin entry. */
export function basenameFor(portal: Portal): string {
  if (portal === 'admin') return '';
  // Only when the portal came from the path; a subdomain needs no basename.
  return window.location.pathname.startsWith(`/${portal}`) ? `/${portal}` : '';
}

export function currentPortal(): Portal {
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith('super.')) return 'super';
  if (host.startsWith('team.')) return 'team';

  const first = window.location.pathname.split('/')[1]?.toLowerCase();
  if (first === 'super') return 'super';
  if (first === 'team') return 'team';

  return 'admin';
}

export const ROLE_NAMES: Record<number, string> = {
  1: 'Administrator',
  2: 'Laboratory',
  3: 'Lab employee',
  4: 'Manager',
  5: 'Office boy',
};
