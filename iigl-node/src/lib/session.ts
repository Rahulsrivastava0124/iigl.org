import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from './env.js';

export interface SessionUser {
  id: number;
  fullname: string;
  /**
   * The role, or null for somebody who has none and holds only their own
   * grants. **Not** 0 — 0 is head office, and `Number(null)` is 0, which is
   * how a no-role account would otherwise be handed the whole system.
   */
  roleId: number | null;
  /** Lab this user belongs to: itself for a lab, the employer for staff. */
  labId: number | null;
}

/**
 * The session is the cookie.
 *
 * It used to be an `express-session` id pointing at the default MemoryStore,
 * which means the sessions lived in the API process: every restart — every
 * file save under `tsx watch`, every deploy — signed everyone out, and a
 * second instance behind a load balancer never recognised the first's cookie.
 *
 * So the cookie carries the user itself, signed with SESSION_SECRET. Nothing
 * is stored server-side, so nothing is lost on restart. It is still
 * `httpOnly`, so page scripts cannot read it, and the signature is what makes
 * it unforgeable — the same secret express-session used for exactly that.
 *
 * ponytail: no server-side revocation. A token stays valid until it expires,
 * so "sign out everywhere" and instant deactivation are not possible; add a
 * `sessions` table (or bump a per-user token version) if either is needed.
 */
export const SESSION_COOKIE = 'iigl.sid';

/**
 * One session per panel.
 *
 * The three panels — super., admin., team. — call the same API, so one cookie
 * was shared by all of them: signing in to admin in one tab replaced the super
 * admin's session in the next, and that tab was signed out. Each panel now
 * names itself on every request (`?portal=`, added by the panel's `apiUrl`) and
 * keeps its session in a cookie of its own: `iigl.sid.super`, `iigl.sid.admin`,
 * `iigl.sid.team`.
 *
 * A request that names no panel — curl, the sweep, the API docs — keeps the
 * plain `iigl.sid`. The name only chooses which cookie is read; the signature
 * is still the only thing that makes one valid.
 */
const PORTALS = new Set(['super', 'admin', 'team']);

export type PortalName = 'super' | 'admin' | 'team';

/** The panel a request names with `?portal=`, or null when it names none. */
export function portalOf(req: Request): PortalName | null {
  const portal = String(req.query?.portal ?? '').toLowerCase();
  return PORTALS.has(portal) ? (portal as PortalName) : null;
}

/**
 * Which roles each door accepts.
 *
 * The same rule as `admits` in `iigl-admin/src/lib/portal.ts`, and it has to be
 * written twice because the two packages share no code — so they are named the
 * same thing, and `docs/ROLES.md` points at both. Change one and change the
 * other.
 *
 * It is used at sign-in to say which of several accounts on one mobile number
 * is the one standing at this door. `docs/ROLES.md` calls the door "not the
 * security boundary", and that still holds: this narrows a set of accounts that
 * have already proved the password, and every request afterwards is checked on
 * the role rather than on where it came in.
 *
 * A role of `null` is admitted by no door, which is what the panel does too.
 * That account holds only the grants in `user_permissions` and has no sign-in
 * screen of its own yet.
 */
export function admits(portal: PortalName, roleId: number | string | null): boolean {
  if (roleId === null || roleId === '') return false;
  const role = Number(roleId);
  if (!Number.isFinite(role)) return false;

  // 1 head office, 2 a laboratory, 3 and up its staff — including the older
  // roles 4 and 5, which are team by another name.
  if (portal === 'super') return role === 1;
  if (portal === 'admin') return role === 2;
  return role >= 3;
}

export function sessionCookieFor(req: Request): string {
  const portal = portalOf(req);
  return portal ? `${SESSION_COOKIE}.${portal}` : SESSION_COOKIE;
}

/**
 * The address of the panel a request came from, for a link mailed back to it.
 *
 * A password reset link used to point at one configured Panel URL — the
 * laboratories' door — so head office and team accounts were mailed a link to a
 * sign-in that refuses them. It now goes back to the page that asked: the
 * browser's Origin, plus the portal's path where the doors share one host and
 * are told apart by path rather than subdomain.
 *
 * The Origin is believed only when it is one of this system's own panels: an
 * address in CORS_ORIGINS, or localhost. Anything else could be a page on
 * somebody else's site asking for a reset so the victim's token is mailed
 * inside a link to that site. Null then, and the caller refuses.
 */
export function panelAddressFor(req: Request): string | null {
  let origin: URL;
  try {
    origin = new URL(req.get('origin') ?? '');
  } catch {
    return null;
  }
  const host = origin.hostname;
  const local = host === 'localhost' || host.endsWith('.localhost');
  if (!local && !env.corsOrigins.includes(origin.origin)) return null;

  const portal = portalOf(req);
  // A subdomain door (team.iigl.org) is the address itself. On one host the
  // door is the path, and the bare address is head office's.
  const byPath = portal !== null && portal !== 'super' && !host.startsWith(`${portal}.`);
  return byPath ? `${origin.origin}/${portal}` : origin.origin;
}

/**
 * How long a sign-in lasts: two days, unless Settings says otherwise.
 *
 * Read at issue time rather than at import, so a change applies to the next
 * sign-in; sessions already handed out keep the length they were signed with,
 * because the expiry is inside the cookie and cannot be shortened from here.
 *
 * **What two days costs.** This cookie is the whole of the authentication —
 * there is no server-side session table, so nothing can be revoked before it
 * expires. A cookie taken off a shared or unlocked machine is therefore usable
 * for two days rather than eight hours. The trade was made deliberately for
 * people who work across several days without wanting to sign in again;
 * shorten it on the Settings screen if that is the wrong trade here, and
 * changing SESSION_SECRET still invalidates every session at once.
 */
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 48;

const sign = (body: string) => createHmac('sha256', env.sessionSecret).update(body).digest('base64url');

const cookieOptions = {
  httpOnly: true,
  /*
    Lax, unless the panel is served from a different origin than this API.

    Lax is the safer setting and the only CSRF defence here: the browser will
    not attach this cookie to a request originating from another site, and
    there is no CSRF token to fall back on. See SESSION_CROSS_SITE in env.ts.

    But that same rule means a Lax cookie is not sent on a cross-site fetch at
    all, so a panel on its own domain signs in successfully and is then
    unauthenticated on its very next request — a failure that reads like a
    broken login rather than a cookie policy. SESSION_CROSS_SITE gives that up
    deliberately, and app.ts checks Origin on mutating requests to compensate.

    None is paired with Secure rather than with env.isProd because browsers
    ignore SameSite=None without it: a cookie set that way is simply dropped.
  */
  ...(env.sessionCrossSite
    ? { sameSite: 'none' as const, secure: true }
    : { sameSite: 'lax' as const, secure: env.isProd }),
  path: '/',
};

export function issueSession(res: Response, user: SessionUser, ttlMs = DEFAULT_TTL_MS): void {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + ttlMs })).toString('base64url');
  res.cookie(sessionCookieFor(res.req), `${body}.${sign(body)}`, { ...cookieOptions, maxAge: ttlMs });
}

export function clearSession(res: Response): void {
  // Only this panel's: signing out of one tab leaves the others signed in.
  res.clearCookie(sessionCookieFor(res.req), cookieOptions);
}

/** The signed-in user, or null when the cookie is absent, tampered with or expired. */
export function readSession(req: Request): SessionUser | null {
  const name = sessionCookieFor(req);
  const token = (req.headers.cookie ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!token) return null;

  const [body, mac] = decodeURIComponent(token).split('.');
  if (!body || !mac) return null;

  // Compared byte for byte in constant time: a length-sensitive or
  // early-exiting compare leaks how much of a guessed signature was right.
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof claims?.exp !== 'number' || claims.exp < Date.now()) return null;
    return {
      id: Number(claims.id),
      fullname: String(claims.fullname),
      // Null stays null. `Number(null)` is 0, and 0 is head office — decoding a
      // role-less session with Number() would hand it the whole system.
      roleId: claims.roleId === null || claims.roleId === undefined ? null : Number(claims.roleId),
      labId: claims.labId === null ? null : Number(claims.labId),
    };
  } catch {
    return null;
  }
}
