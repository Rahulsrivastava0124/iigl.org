import rateLimit from 'express-rate-limit';
import { env } from '../lib/env.js';
/**
 * Rate limits.
 *
 * Two endpoints are reachable without a session and are worth abusing: sign-in,
 * because accounts are keyed by guessable mobile numbers, and verification
 * logging, because it inserts a row on every call.
 *
 * Limits are disabled outside production so the sweep and local work are not
 * throttled; the sweep alone makes twenty sign-in attempts.
 */
const shared = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !env.isProd,
};
const tooMany = (message) => ({
    ...shared,
    message: { error: 'too_many_requests', message },
    handler: (_req, res) => {
        res.status(429).json({ error: 'too_many_requests', message });
    },
});
/**
 * Sign-in, by address. Deliberately tight: a person signing in gets it right
 * within a handful of tries, and anyone needing more than ten in a quarter of
 * an hour is working through a list.
 */
export const loginLimiter = rateLimit({
    ...tooMany('Too many sign-in attempts. Wait a few minutes and try again.'),
    windowMs: 15 * 60 * 1000,
    limit: 10,
    // Count only failures, so a busy shared address is not locked out by people
    // signing in successfully.
    skipSuccessfulRequests: true,
});
/**
 * Password reset requests, by address. Each one sends mail and writes a row,
 * and unlike sign-in there is no wrong answer to slow anyone down, so the limit
 * is the only thing standing between this endpoint and a mail flood.
 */
export const resetLimiter = rateLimit({
    ...tooMany('Too many password reset requests. Wait a few minutes and try again.'),
    windowMs: 60 * 60 * 1000,
    limit: 5,
});
/** Verification logging, which writes a row per call. */
export const verifyLogLimiter = rateLimit({
    ...tooMany('Too many verification lookups from this address. Try again shortly.'),
    windowMs: 60 * 60 * 1000,
    limit: 60,
});
/**
 * Certificate rendering, which starts a headless browser page per request.
 * Authenticated, so this is about protecting the renderer rather than abuse.
 */
export const renderLimiter = rateLimit({
    ...tooMany('Too many print requests at once. Wait a moment and try again.'),
    windowMs: 60 * 1000,
    limit: 30,
});
