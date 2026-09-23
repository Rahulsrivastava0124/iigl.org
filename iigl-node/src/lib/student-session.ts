import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from './env.js';

/**
 * The student portal's own session.
 *
 * A student who signs in on the public website is not a staff account — they
 * hold no role and belong to no laboratory — so they get a cookie of their own
 * rather than sharing the panels' `iigl.sid`. It carries a `kind: 'student'`
 * claim, and the reader refuses anything without it, so a staff cookie can
 * never be read as a student and the reverse cannot happen either.
 *
 * Signed the same way as the staff session — HMAC over the body with
 * SESSION_SECRET, nothing stored server-side — so it survives restarts and
 * needs no session table. Like that one, it cannot be revoked before it
 * expires; a day is short enough that this is acceptable for a read-only
 * portal.
 */
export interface StudentSession {
  id: number;
  name: string;
}

const STUDENT_COOKIE = 'iigl.student';

/** A day. A student reads their courses and certificates; they are not working in it. */
const TTL_MS = 1000 * 60 * 60 * 24;

const sign = (body: string) => createHmac('sha256', env.sessionSecret).update(body).digest('base64url');

const cookieOptions = {
  httpOnly: true,
  // The same trade the staff session makes: None+Secure when the site is a
  // different origin than the API, Lax otherwise. See lib/session.ts.
  ...(env.sessionCrossSite
    ? { sameSite: 'none' as const, secure: true }
    : { sameSite: 'lax' as const, secure: env.isProd }),
  path: '/',
};

export function issueStudentSession(res: Response, student: StudentSession): void {
  const body = Buffer.from(
    JSON.stringify({ id: student.id, name: student.name, kind: 'student', exp: Date.now() + TTL_MS }),
  ).toString('base64url');
  res.cookie(STUDENT_COOKIE, `${body}.${sign(body)}`, { ...cookieOptions, maxAge: TTL_MS });
}

export function clearStudentSession(res: Response): void {
  res.clearCookie(STUDENT_COOKIE, cookieOptions);
}

/** The signed-in student, or null when the cookie is absent, tampered with or expired. */
export function readStudentSession(req: Request): StudentSession | null {
  const token = (req.headers.cookie ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STUDENT_COOKIE}=`))
    ?.slice(STUDENT_COOKIE.length + 1);
  if (!token) return null;

  const [body, mac] = decodeURIComponent(token).split('.');
  if (!body || !mac) return null;

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (claims?.kind !== 'student') return null;
    if (typeof claims?.exp !== 'number' || claims.exp < Date.now()) return null;
    return { id: Number(claims.id), name: String(claims.name) };
  } catch {
    return null;
  }
}
