import 'dotenv/config';
function required(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`Missing required env var: ${name}`);
    return v;
}
const PLACEHOLDER_SECRETS = new Set(['change-me-in-production', 'secret', 'changeme', '']);
/**
 * A known session secret means anyone can forge a session cookie, which is
 * authentication bypass for every account including the administrator. Outside
 * development that has to stop the process, not print a warning nobody reads.
 */
function sessionSecret() {
    const value = required('SESSION_SECRET');
    const weak = PLACEHOLDER_SECRETS.has(value.trim()) || value.trim().length < 32;
    if (weak) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('SESSION_SECRET is a placeholder or shorter than 32 characters. Set a long random value; ' +
                'generate one with:  node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"');
        }
        console.warn('[warn] SESSION_SECRET is weak. This is tolerated in development and refused in production.');
    }
    return value;
}
export const env = {
    databaseUrl: required('DATABASE_URL'),
    port: Number(process.env.PORT ?? 3000),
    sessionSecret: sessionSecret(),
    isProd: process.env.NODE_ENV === 'production',
    /** Public site origin. Printed QR codes resolve against this. */
    publicSiteUrl: (process.env.PUBLIC_SITE_URL ?? 'https://www.iigl.org').replace(/\/+$/, ''),
    /**
     * The Laravel public/ directory, which still holds the card logos and every
     * uploaded item image and signature. Cards read from it until those assets
     * are moved into this project.
     */
    legacyPublicRoot: process.env.LEGACY_PUBLIC_ROOT ?? '../iigl.org/public',
    /**
     * Browser origins allowed to call this API, comma separated. Authentication
     * is a cookie, so this must be an explicit allowlist: a wildcard cannot be
     * combined with credentials, and reflecting whatever Origin arrives would let
     * any site call the API with the visitor's session.
     */
    /**
     * Where the admin panel is served from. A password reset link points here,
     * so it has to be the address the person actually uses, not the API's.
     */
    panelUrl: (process.env.PANEL_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
    /**
     * SMTP connection string, e.g. `smtps://user:pass@smtp.example.com:465`.
     * Absent means no mail: password reset then logs the link in development and
     * refuses in production rather than reporting a success that never arrives.
     */
    smtpUrl: process.env.SMTP_URL ?? '',
    mailFrom: process.env.MAIL_FROM ?? 'IIGL <no-reply@iigl.org>',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    /**
     * Cloudflare R2, where uploaded files are kept. The four credentials travel
     * together: with any one of them missing there is no usable client, so
     * storage reports itself unconfigured rather than failing on first upload.
     * `publicUrl` is the read side — the r2.dev (or custom) domain a stored
     * object is served from, which is not the S3 endpoint the API writes to.
     */
    r2: {
        accountId: process.env.R2_ACCOUNT_ID ?? '',
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        bucket: process.env.R2_BUCKET_NAME ?? '',
        publicUrl: (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, ''),
    },
};
