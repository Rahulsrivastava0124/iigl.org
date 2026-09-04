import { db } from '../db/index.js';
import { env } from '../lib/env.js';
import { badRequest } from '../lib/errors.js';
const number = (label, min, max) => (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
        throw badRequest(`${label} must be a number between ${min} and ${max}.`);
    }
};
/**
 * Every setting, in the four groups the screen tabs by. The part of the key
 * before the dot is the group, so the screen needs no second list.
 */
export const SETTINGS = [
    // ------------------------------------------------------------- company
    {
        key: 'company.name',
        label: 'Company name',
        kind: 'text',
        fallback: () => 'International Institute of Gemology & Laboratory',
        help: 'Printed on certificates and invoices.',
    },
    { key: 'company.address', label: 'Address', kind: 'multiline', fallback: () => '' },
    { key: 'company.city', label: 'City', kind: 'text', fallback: () => '' },
    { key: 'company.state', label: 'State', kind: 'text', fallback: () => '' },
    { key: 'company.pincode', label: 'Pincode', kind: 'text', fallback: () => '' },
    { key: 'company.phone', label: 'Phone', kind: 'text', fallback: () => '' },
    { key: 'company.email', label: 'Email', kind: 'email', fallback: () => '' },
    {
        key: 'company.gstin',
        label: 'GSTIN',
        kind: 'text',
        fallback: () => '',
        help: 'The registration number printed on an invoice.',
    },
    {
        key: 'company.website',
        label: 'Website',
        kind: 'url',
        fallback: () => env.publicSiteUrl,
        help: 'Also the origin printed QR codes resolve against.',
    },
    // --------------------------------------------------------- certificate
    {
        key: 'certificate.prefix',
        label: 'Certificate prefix',
        kind: 'text',
        fallback: () => '',
        help: 'Put in front of every new certificate number. The number itself is composed ' +
            'as laboratory, day, counter, year, month — that part is ported behaviour and ' +
            'is not editable. Certificates already issued keep the number they were printed with.',
    },
    {
        key: 'certificate.counter_width',
        label: 'Counter width',
        kind: 'number',
        fallback: () => '4',
        help: 'How many digits the daily counter is padded to. Four gives 0001.',
        check: number('Counter width', 1, 8),
    },
    // ---------------------------------------------------------- session and mail
    {
        key: 'session.hours',
        label: 'Session length, hours',
        kind: 'number',
        fallback: () => '48',
        help: 'How long a sign-in lasts. Two days by default. Applies to sessions issued after ' +
            'the change: one already handed out keeps the length it was signed with, because ' +
            'the expiry is inside the cookie and nothing can revoke it early.',
        check: number('Session length', 1, 720),
    },
    {
        key: 'mail.panel_url',
        label: 'Panel URL',
        kind: 'url',
        fallback: () => env.panelUrl,
        help: 'Where a password reset link points. It has to be the address people open.',
    },
    {
        key: 'mail.from',
        label: 'Mail from',
        kind: 'text',
        fallback: () => env.mailFrom,
        help: 'The From address on outgoing mail.',
    },
    {
        key: 'mail.smtp_url',
        label: 'SMTP URL',
        kind: 'text',
        secret: true,
        fallback: () => env.smtpUrl,
        help: 'smtps://user:password@host:465. Held back from the form once set, because it ' +
            'carries a password; saving an empty value leaves it as it is.',
    },
];
const SPEC = new Map(SETTINGS.map((s) => [s.key, s]));
/**
 * A stored secret, with the secret part taken out.
 *
 * The whole value never leaves the server — that is what stops a mail password
 * reaching a screenshot, a shared screen or the browser's memory. But "is it
 * the right server, the right account, the right port" is a fair question, and
 * everything needed to answer it is safe to show. So the password is replaced
 * with dots and the rest is sent as written.
 *
 * A value that is not a URL has its middle removed instead, which still shows
 * enough to tell one string from another without handing it over.
 */
function redact(value) {
    try {
        const u = new URL(value);
        if (!u.password)
            return value;
        const shown = new URL(value);
        shown.password = '';
        // `URL` drops an empty password, so the dots go back in by hand rather
        // than by rebuilding the string and hoping the parts line up.
        return shown.toString().replace(`${u.username}@`, `${u.username}:••••••••@`);
    }
    catch {
        if (value.length <= 8)
            return '••••••••';
        return `${value.slice(0, 4)}…${value.slice(-4)}`;
    }
}
let cache = null;
const TTL = 60_000;
/** Every stored value, keyed. Absent keys are absent, not defaulted. */
async function stored() {
    if (cache && Date.now() - cache.at < TTL)
        return cache.values;
    const values = new Map();
    try {
        for (const row of await db.selectFrom('settings').select(['key', 'value']).execute()) {
            if (row.value !== null && row.value !== '')
                values.set(String(row.key), String(row.value));
        }
        cache = { at: Date.now(), values };
    }
    catch {
        // No table, or it cannot be read. Every caller falls back to its default,
        // which is what the code did before this existed.
    }
    return values;
}
/** One setting, as text. The default when nobody has set it. */
export async function setting(key) {
    const spec = SPEC.get(key);
    if (!spec)
        throw new Error(`Unknown setting: ${key}`);
    return (await stored()).get(key) ?? spec.fallback();
}
export async function settingNumber(key) {
    return Number(await setting(key));
}
/** What the settings screen reads: every setting, its value and its default. */
export async function allSettings() {
    const values = await stored();
    return SETTINGS.map((s) => ({
        key: s.key,
        group: s.key.split('.')[0],
        label: s.label,
        kind: s.kind,
        help: s.help ?? null,
        // A secret is never sent back. `set` says whether one is stored, which is
        // all the form needs to show "leave blank to keep it".
        value: s.secret ? '' : (values.get(s.key) ?? s.fallback()),
        secret: Boolean(s.secret),
        set: values.has(s.key),
        /**
         * What a stored secret looks like with its password removed, so the screen
         * can show which server and account are configured without the secret
         * itself ever leaving here. Empty for everything else.
         */
        preview: s.secret && values.has(s.key) ? redact(values.get(s.key)) : '',
        /** What it falls back to, so the screen can say what "empty" means. */
        fallback: s.secret ? '' : s.fallback(),
    }));
}
/**
 * Writes settings. Unknown keys are refused rather than stored: a typo that
 * silently becomes a row is a setting nobody can find and nothing reads.
 *
 * An empty value deletes the row, which is how a setting is put back to its
 * default — except a secret, where empty means "leave what is there".
 */
export async function saveSettings(patch, userId) {
    const written = [];
    for (const [key, raw] of Object.entries(patch)) {
        const spec = SPEC.get(key);
        if (!spec)
            throw badRequest(`Unknown setting: ${key}.`);
        const value = raw == null ? '' : String(raw).trim();
        if (value === '') {
            if (spec.secret)
                continue;
            await db.deleteFrom('settings').where('key', '=', key).execute();
            written.push(key);
            continue;
        }
        spec.check?.(value);
        await db
            .insertInto('settings')
            .values({
            key,
            value,
            updated_by: userId,
            created_at: new Date(),
            updated_at: new Date(),
        })
            .onDuplicateKeyUpdate({ value, updated_by: userId, updated_at: new Date() })
            .execute();
        written.push(key);
    }
    // The next read sees what was just written rather than waiting out the TTL.
    cache = null;
    return written;
}
/** Drops the cache. For tests, and for anything that writes rows directly. */
export function forgetSettings() {
    cache = null;
}
