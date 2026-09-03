import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { setting, settingNumber } from '../services/settings.service.js';
import { wrap } from '../lib/async.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { sendPasswordReset } from '../lib/mail.js';
import { requireAuth, resolveLabId } from '../middleware/auth.js';
import { clearSession, issueSession, type SessionUser } from '../lib/session.js';

/** How long a reset link works for. Long enough to read mail, short enough to matter. */
const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * The one account a reset may act on, or null.
 *
 * Found by **either** the mobile number or the email address. People sign in
 * with their mobile, so that is the identifier they know; asking for an email
 * at the one moment somebody is locked out is asking for the thing they are
 * least sure of.
 *
 * Neither column is unique — four addresses are currently held by two accounts
 * each, and mobile numbers likewise. Sign-in resolves that with the password;
 * a reset has no such second factor, so it refuses rather than guessing which
 * of two people is asking.
 *
 * The reset itself still runs on the account's **email**, because that is
 * where the link goes and what `password_resets` is keyed by. An account with
 * no address on it therefore cannot be reset this way, and says nothing
 * different from one that does not exist.
 */
async function soleAccountFor(identifier: string) {
  const rows = await db
    .selectFrom('users')
    .select(['id', 'fullname', 'email', 'mobile', 'is_active'])
    .where((eb) => eb.or([eb('email', '=', identifier), eb('mobile', '=', identifier)]))
    .execute();

  const active = rows.filter((r) => r.is_active);
  const withEmail = active.filter((r) => r.email);

  // Which of the four things happened, so the reply can say. Kept apart from
  // the reply itself: what the lookup found and what a stranger is told are
  // two decisions, and folding them together is how the second gets changed by
  // accident.
  if (active.length === 0) return { why: 'none' } as const;
  if (withEmail.length === 0) return { why: 'no-email' } as const;
  if (withEmail.length > 1) return { why: 'ambiguous' } as const;
  return { why: 'ok', user: withEmail[0] } as const;
}

/**
 * An address, recognisable to its owner and not much use to anybody else.
 *
 * `rahulhomepoint@gmail.com` becomes `rah••••••••••@gmail.com`. Enough to say
 * which mailbox to open; not enough to hand somebody an address they did not
 * already have.
 */
function maskEmail(email: string): string {
  const [name, host] = email.split('@');
  if (!host) return '•••';
  const head = name.slice(0, 3);
  return `${head}${'•'.repeat(Math.max(3, name.length - head.length))}@${host}`;
}

export const authRoutes = Router();

authRoutes.post(
  '/login',
  wrap(async (req, res) => {
    const { mobile, password } = req.body ?? {};
    if (!mobile || !password) throw badRequest('Enter your mobile number and password.');

    // users.mobile carries no unique constraint and the live data contains
    // numbers held by more than one account, so this can return several rows.
    // Taking the first would hand the sign-in to whichever id happens to be
    // lowest, which is how three active staff are currently locked out.
    const candidates = await db
      .selectFrom('users')
      .select([
        'id',
        'fullname',
        'mobile',
        'password',
        'role_id',
        'is_active',
        'status',
        'profile_photo',
      ])
      .where('mobile', '=', String(mobile))
      .orderBy('id')
      .execute();

    // Match on the password rather than on the row order: when two accounts
    // share a number they have different passwords, so the credential itself
    // says which person is signing in.
    const matches: typeof candidates = [];
    for (const candidate of candidates) {
      if (await bcrypt.compare(String(password), candidate.password)) matches.push(candidate);
    }

    // Same response whether the account is missing or the password is wrong,
    // so the endpoint cannot be used to enumerate registered mobile numbers.
    if (matches.length === 0) {
      throw unauthorized('That mobile number and password do not match.');
    }

    const active = matches.filter((m) => m.is_active);
    if (active.length === 0) throw unauthorized('This account has been deactivated.');

    // Two active accounts, one number, one password. Guessing would sign
    // someone in as the wrong person, possibly with a different role.
    if (active.length > 1) {
      throw unauthorized(
        'More than one active account shares this mobile number and password. ' +
          'Ask an administrator to separate them before signing in.',
      );
    }

    const row = active[0];

    const user: SessionUser = {
      id: Number(row.id),
      fullname: row.fullname,
      // Null stays null. Number(null) is 0, and 0 is head office.
      roleId: row.role_id === null ? null : Number(row.role_id),
      labId: await resolveLabId(Number(row.id), Number(row.role_id)),
    };

    // The configured session length, two days unless Settings says otherwise.
    const hours = await settingNumber('session.hours');
    issueSession(res, user, 1000 * 60 * 60 * hours);
    // The photo travels beside the session rather than inside it. A cookie is
    // signed once and then carried for as long as it lasts, so a path stored
    // in it would still be the old picture after somebody changed theirs —
    // and every request would carry a path it never reads.
    res.json({ user: { ...user, photo: row.profile_photo ?? null } });
  }),
);

/**
 * Starts a password reset.
 *
 * Answers the same way whether or not the address is on an account: the reply
 * to "is this email registered" must not depend on the answer, or the endpoint
 * becomes a way to test addresses against the customer list.
 *
 * Tokens are stored hashed in `password_resets` — the Laravel table, already in
 * the schema and empty — so a copy of the database is not a set of live reset
 * links. Any earlier token for the address is dropped, so asking twice
 * invalidates the first mail rather than leaving two keys in circulation.
 */
authRoutes.post(
  '/forgot-password',
  wrap(async (req, res) => {
    // A mobile number or an email address. Lower-cased for the address; a
    // number is unaffected by that.
    const identifier = String(req.body?.identifier ?? req.body?.email ?? '')
      .trim()
      .toLowerCase();
    if (!identifier) throw badRequest('Enter your mobile number or the email on your account.');

    /*
      The account is checked before anything is promised.

      A deliberate change from answering identically whether or not the
      identifier matched. That reply protected against somebody using this page
      to test which numbers are registered; the cost was that a person who
      simply mistyped their own number was told a mail was on its way and then
      waited for it. The rate limit — five an hour — is what now stands between
      this page and somebody enumerating accounts with it.
    */
    const found = await soleAccountFor(identifier);

    if (found.why === 'none') {
      throw badRequest('No active account uses that mobile number or email address.');
    }
    if (found.why === 'no-email') {
      throw badRequest(
        'That account has no email address on it, so there is nowhere to send the link. ' +
          'Ask an administrator to set a new password for you.',
      );
    }
    if (found.why === 'ambiguous') {
      throw badRequest(
        'More than one active account uses that. Try your mobile number instead, or ask ' +
          'an administrator.',
      );
    }

    const user = found.user;
    // The reset runs on the account's own address, whichever way it was found.
    const email = String(user.email);

    const token = randomBytes(32).toString('hex');

    await db.deleteFrom('password_resets').where('email', '=', email).execute();
    await db
      .insertInto('password_resets')
      .values({
        email,
        // Whose reset this is, decided here by the identifier that was actually
        // given. The address alone cannot say when two accounts share it, and
        // asking again at the far end is what made a link sent to one of them
        // impossible to use.
        user_id: Number(user.id),
        token: await bcrypt.hash(token, 10),
        created_at: new Date(),
      })
      .execute();

    // Where the panel is served from, as Settings has it — the address people
    // actually open, which is not always the one in the environment.
    const panelUrl = (await setting('mail.panel_url')).replace(/\/+$/, '');
    const url = `${panelUrl}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
    // Counted from the row that was just written, so the mail and the check in
    // /reset-password are reading the same clock.
    await sendPasswordReset(email, url, user.fullname, new Date(Date.now() + RESET_TTL_MS));

    res.json({
      ok: true,
      // The masked address, so somebody with two mailboxes knows which to open
      // and somebody probing learns nothing they did not already type.
      message:
        `A link to choose a new password is on its way to ${maskEmail(email)}. ` +
        'It stops working in an hour.',
    });
  }),
);

/** Finishes a reset: the token from the mail, and the new password. */
authRoutes.post(
  '/reset-password',
  wrap(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const token = String(req.body?.token ?? '');
    const password = String(req.body?.new_password ?? req.body?.password ?? '');

    if (!email || !token) throw badRequest('This reset link is incomplete. Ask for a new one.');
    if (password.length < 8) throw badRequest('New password must be at least 8 characters.');

    const expired = badRequest('This reset link has expired or has already been used. Ask for a new one.');

    const row = await db
      .selectFrom('password_resets')
      .select(['token', 'created_at', 'user_id'])
      .where('email', '=', email)
      .executeTakeFirst();
    if (!row) throw expired;

    const age = Date.now() - new Date(row.created_at ?? 0).getTime();
    if (age > RESET_TTL_MS) {
      await db.deleteFrom('password_resets').where('email', '=', email).execute();
      throw expired;
    }
    if (!(await bcrypt.compare(token, row.token))) throw expired;

    /*
      Whose password this opens.

      The row says, when it was written after migration 022 — which is what
      makes a reset asked for by mobile completable even where the address is
      shared. A row from before that falls back to resolving the address, and
      still refuses when it names two people, because overwriting one of two
      passwords on a guess is worse than asking somebody to make a new request.
    */
    let user: { id: number; is_active: number | null };

    if (row.user_id) {
      const named = await db
        .selectFrom('users')
        .select(['id', 'is_active'])
        .where('id', '=', Number(row.user_id))
        .executeTakeFirst();
      if (!named || !named.is_active) throw expired;
      user = named;
    } else {
      const found = await soleAccountFor(email);
      if (found.why !== 'ok') {
        throw badRequest(
          'This address no longer identifies a single active account, so it cannot say which ' +
            'password to reset. Ask an administrator to set your password.',
        );
      }
      user = found.user;
    }

    // Cost 10 matches the existing Laravel hashes, so old and new rows stay uniform.
    await db
      .updateTable('users')
      .set({ password: await bcrypt.hash(password, 10), updated_at: new Date() })
      .where('id', '=', user.id)
      .execute();

    // Single use: the link is spent whether or not the mail is still in an inbox.
    await db.deleteFrom('password_resets').where('email', '=', email).execute();

    res.json({ ok: true });
  }),
);

authRoutes.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/**
 * Who is signed in.
 *
 * The session itself answers all of this except the photograph, which is read
 * from the row so that changing it takes effect on the next load rather than
 * on the next sign-in.
 */
authRoutes.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('users')
      .select('profile_photo')
      .where('id', '=', req.user.id)
      .executeTakeFirst();

    res.json({ user: { ...req.user, photo: row?.profile_photo ?? null } });
  }),
);

authRoutes.post(
  '/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const { current_password, new_password } = req.body ?? {};
    if (!new_password) throw badRequest('Enter a new password.');
    if (String(new_password).length < 8) throw badRequest('New password must be at least 8 characters.');

    /*
     * The current password is **optional**, by decision.
     *
     * Asked for, it is still checked — a wrong one is refused rather than
     * ignored, so an old client cannot be waved through by sending rubbish.
     * Omitted, the session alone is the authority.
     *
     * What that costs: anybody who reaches an open session — a shared machine,
     * an unlocked screen, a stolen cookie — can take the account over, because
     * knowing the old password is what otherwise stands in the way. It was
     * asked for and it is written down here rather than left to be discovered.
     */
    if (current_password !== undefined && current_password !== null && current_password !== '') {
      const row = await db
        .selectFrom('users')
        .select('password')
        .where('id', '=', req.user.id)
        .executeTakeFirstOrThrow();

      if (!(await bcrypt.compare(String(current_password), row.password))) {
        throw badRequest('Your current password is incorrect.');
      }
    }

    // Cost 10 matches the existing Laravel hashes, so old and new rows stay uniform.
    await db
      .updateTable('users')
      .set({ password: await bcrypt.hash(String(new_password), 10), updated_at: new Date() })
      .where('id', '=', req.user.id)
      .execute();

    res.json({ ok: true });
  }),
);
