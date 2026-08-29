import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { sendPasswordReset } from '../lib/mail.js';
import { requireAuth, resolveLabId } from '../middleware/auth.js';
import { clearSession, issueSession } from '../lib/session.js';
/** How long a reset link works for. Long enough to read mail, short enough to matter. */
const RESET_TTL_MS = 60 * 60 * 1000;
/**
 * The one account a reset may act on, or null.
 *
 * `users.email` carries no unique constraint and four addresses are currently
 * held by two accounts each, exactly as mobile numbers are. Sign-in resolves
 * that ambiguity with the password; a reset has no such second factor, so it
 * refuses rather than guessing which of two people is asking.
 */
async function soleAccountFor(email) {
    const rows = await db
        .selectFrom('users')
        .select(['id', 'fullname', 'email', 'is_active'])
        .where('email', '=', email)
        .execute();
    const active = rows.filter((r) => r.is_active);
    return active.length === 1 ? active[0] : null;
}
export const authRoutes = Router();
authRoutes.post('/login', wrap(async (req, res) => {
    const { mobile, password } = req.body ?? {};
    if (!mobile || !password)
        throw badRequest('Enter your mobile number and password.');
    // users.mobile carries no unique constraint and the live data contains
    // numbers held by more than one account, so this can return several rows.
    // Taking the first would hand the sign-in to whichever id happens to be
    // lowest, which is how three active staff are currently locked out.
    const candidates = await db
        .selectFrom('users')
        .select(['id', 'fullname', 'mobile', 'password', 'role_id', 'is_active', 'status'])
        .where('mobile', '=', String(mobile))
        .orderBy('id')
        .execute();
    // Match on the password rather than on the row order: when two accounts
    // share a number they have different passwords, so the credential itself
    // says which person is signing in.
    const matches = [];
    for (const candidate of candidates) {
        if (await bcrypt.compare(String(password), candidate.password))
            matches.push(candidate);
    }
    // Same response whether the account is missing or the password is wrong,
    // so the endpoint cannot be used to enumerate registered mobile numbers.
    if (matches.length === 0) {
        throw unauthorized('That mobile number and password do not match.');
    }
    const active = matches.filter((m) => m.is_active);
    if (active.length === 0)
        throw unauthorized('This account has been deactivated.');
    // Two active accounts, one number, one password. Guessing would sign
    // someone in as the wrong person, possibly with a different role.
    if (active.length > 1) {
        throw unauthorized('More than one active account shares this mobile number and password. ' +
            'Ask an administrator to separate them before signing in.');
    }
    const row = active[0];
    const user = {
        id: Number(row.id),
        fullname: row.fullname,
        // Null stays null. Number(null) is 0, and 0 is head office.
        roleId: row.role_id === null ? null : Number(row.role_id),
        labId: await resolveLabId(Number(row.id), Number(row.role_id)),
    };
    issueSession(res, user);
    res.json({ user });
}));
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
authRoutes.post('/forgot-password', wrap(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email)
        throw badRequest('Enter the email address on your account.');
    const said = {
        ok: true,
        message: 'If that address is on an account, a link to choose a new password is on its way. ' +
            'It stops working in an hour.',
    };
    const user = await soleAccountFor(email);
    if (!user)
        return res.json(said);
    const token = randomBytes(32).toString('hex');
    await db.deleteFrom('password_resets').where('email', '=', email).execute();
    await db
        .insertInto('password_resets')
        .values({ email, token: await bcrypt.hash(token, 10), created_at: new Date() })
        .execute();
    const url = `${env.panelUrl}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
    await sendPasswordReset(email, url, user.fullname);
    res.json(said);
}));
/** Finishes a reset: the token from the mail, and the new password. */
authRoutes.post('/reset-password', wrap(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const token = String(req.body?.token ?? '');
    const password = String(req.body?.new_password ?? req.body?.password ?? '');
    if (!email || !token)
        throw badRequest('This reset link is incomplete. Ask for a new one.');
    if (password.length < 8)
        throw badRequest('New password must be at least 8 characters.');
    const expired = badRequest('This reset link has expired or has already been used. Ask for a new one.');
    const row = await db
        .selectFrom('password_resets')
        .select(['token', 'created_at'])
        .where('email', '=', email)
        .executeTakeFirst();
    if (!row)
        throw expired;
    const age = Date.now() - new Date(row.created_at ?? 0).getTime();
    if (age > RESET_TTL_MS) {
        await db.deleteFrom('password_resets').where('email', '=', email).execute();
        throw expired;
    }
    if (!(await bcrypt.compare(token, row.token)))
        throw expired;
    const user = await soleAccountFor(email);
    if (!user) {
        throw badRequest('This address is on more than one active account, so it cannot identify which to reset. ' +
            'Ask an administrator to set your password.');
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
}));
authRoutes.post('/logout', (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
});
authRoutes.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});
authRoutes.post('/change-password', requireAuth, wrap(async (req, res) => {
    const { current_password, new_password } = req.body ?? {};
    if (!new_password)
        throw badRequest('Enter a new password.');
    if (String(new_password).length < 8)
        throw badRequest('New password must be at least 8 characters.');
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
}));
