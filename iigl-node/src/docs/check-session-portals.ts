/**
 * One session per panel: signing in to one portal leaves the others signed in.
 *
 *   npm run check:sessions
 */
import assert from 'node:assert';
import type { Request, Response } from 'express';
import { issueSession, readSession, type SessionUser } from '../lib/session.js';

const user = (id: number, roleId: number | null): SessionUser => ({ id, fullname: `u${id}`, roleId, labId: null });
const requestFor = (portal: string | undefined, cookie = '') =>
  ({ query: portal ? { portal } : {}, headers: { cookie } }) as unknown as Request;

/** Signs in on a portal and returns the cookie it set, as a Cookie header pair. */
function signIn(portal: string | undefined, who: SessionUser): string {
  let pair = '';
  const res = {
    req: requestFor(portal),
    cookie: (name: string, value: string) => {
      pair = `${name}=${encodeURIComponent(value)}`;
    },
  } as unknown as Response;
  issueSession(res, who);
  return pair;
}

const superCookie = signIn('super', user(1, 1));
const adminCookie = signIn('admin', user(7, 2));
assert.match(superCookie, /^iigl\.sid\.super=/);
assert.match(adminCookie, /^iigl\.sid\.admin=/);

// Both signed in at once, as two tabs leave the browser.
const jar = `${superCookie}; ${adminCookie}`;
assert.equal(readSession(requestFor('super', jar))?.id, 1, 'super keeps its own session beside admin');
assert.equal(readSession(requestFor('admin', jar))?.id, 7, 'admin reads its own session');
assert.equal(readSession(requestFor('team', jar)), null, 'team is signed in by neither');
assert.equal(readSession(requestFor(undefined, jar)), null, 'a request naming no panel borrows none');

// Scripts and the API docs name no panel, and keep the plain cookie.
const plain = signIn(undefined, user(3, 3));
assert.match(plain, /^iigl\.sid=/);
assert.equal(readSession(requestFor(undefined, `${jar}; ${plain}`))?.id, 3, 'no portal reads the plain cookie');
assert.equal(readSession(requestFor('super', plain)), null, 'the plain cookie signs no panel in');
assert.equal(readSession(requestFor('bogus', plain))?.id, 3, 'an unknown portal counts as none');

console.log('Sessions: one per panel, and the plain cookie for everything else.');
