import { Router } from 'express';
import nodemailer from 'nodemailer';
import { wrap } from '../lib/async.js';
import { badRequest } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { allSettings, saveSettings, setting } from '../services/settings.service.js';
/**
 * Settings.
 *
 * One resource, not one per group: the screen reads them all at once and saves
 * whichever it changed, and a group is only the part of a key before the dot.
 *
 * Administrators only. These decide what customers are billed and what is
 * printed on a certificate.
 */
export const settingsRoutes = Router();
settingsRoutes.use(requireAdmin);
/** Every setting, its value, its default, and whether it has been set. */
settingsRoutes.get('/', wrap(async (_req, res) => {
    res.json({ data: await allSettings() });
}));
/**
 * Saves the ones sent. An empty value puts a setting back to its default
 * rather than storing an empty string — except a secret, where empty means
 * "leave what is stored", so the form never has to echo a password back.
 */
settingsRoutes.patch('/', wrap(async (req, res) => {
    const written = await saveSettings((req.body ?? {}), req.user.id);
    res.json({ data: { written } });
}));
/**
 * Opens the mail connection and reports what happened, without sending
 * anything or storing anything.
 *
 * Checked before a save rather than after, because the alternative is finding
 * out on the day somebody needs a password reset. `verify()` connects, starts
 * TLS and authenticates — everything except handing over a message — so a
 * wrong host, a closed port, a bad certificate and a refused password all
 * surface here.
 *
 * Given no url, the stored one is tested. That is how the button works on a
 * field that has been saved and is therefore empty on screen.
 *
 * Timeouts are short and explicit: a mail server that is not answering should
 * say so in seconds. Nodemailer's defaults leave it hanging for minutes, which
 * reads as a broken panel rather than a broken setting.
 */
settingsRoutes.post('/test-smtp', wrap(async (req, res) => {
    const url = String((req.body ?? {}).url ?? '').trim() || (await setting('mail.smtp_url'));
    if (!url)
        throw badRequest('There is no SMTP URL to test. Type one, or save one first.');
    let transport;
    try {
        transport = nodemailer.createTransport({
            url,
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 10_000,
        });
    }
    catch {
        // A string that is not a URL at all. An unencoded #, @ or : inside the
        // password is the usual cause, and it fails here rather than at connect.
        res.json({
            data: {
                ok: false,
                message: 'That is not a valid connection string. A #, @ or : inside the password has to be ' +
                    'written %23, %40 or %3A.',
            },
        });
        return;
    }
    try {
        await transport.verify();
        res.json({ data: { ok: true, message: 'Connected and signed in.' } });
    }
    catch (e) {
        res.json({ data: { ok: false, message: explain(e) } });
    }
    finally {
        transport.close();
    }
}));
/** A mail server's refusal, in words somebody can act on. */
function explain(err) {
    const raw = err.message ?? 'The connection failed.';
    if (err.code === 'EAUTH' || err.responseCode === 535) {
        return ('The server refused the username or password. Google no longer accepts an account ' +
            `password here: turn on 2-Step Verification and use an App Password. (${raw})`);
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET' || err.code === 'ECONNECTION') {
        return `Could not reach the mail server. Check the host and the port. (${raw})`;
    }
    if (err.code === 'EDNS' || /getaddrinfo/i.test(raw)) {
        return `That host does not resolve. Check the spelling. (${raw})`;
    }
    return raw;
}
