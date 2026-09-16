import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const PLACEHOLDER_SECRETS = new Set(['change-me-in-production', 'secret', 'changeme', '']);

/**
 * A known session secret means anyone can forge a session cookie, which is
 * authentication bypass for every account including the administrator. Outside
 * development that has to stop the process, not print a warning nobody reads.
 */
function sessionSecret(): string {
  const value = required('SESSION_SECRET');
  const weak = PLACEHOLDER_SECRETS.has(value.trim()) || value.trim().length < 32;

  if (weak) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SESSION_SECRET is a placeholder or shorter than 32 characters. Set a long random value; ' +
            'generate one with:  node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"',
      );
    }
    console.warn(
      '[warn] SESSION_SECRET is weak. This is tolerated in development and refused in production.',
    );
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
   * The Nominatim server that places laboratories on the website's map by
   * their city. OpenStreetMap's own by default; see geocode.service.ts.
   */
  geocoderUrl: process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org',
  /**
   * SMTP connection string, e.g. `smtps://user:pass@smtp.example.com:465`.
   * Absent means no mail: password reset then logs the link in development and
   * refuses in production rather than reporting a success that never arrives.
   */
  smtpUrl: process.env.SMTP_URL ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'IIGL <no-reply@iigl.org>',
  /**
   * Browser origins allowed to call this API, comma separated. Authentication
   * is a cookie, so this must be an explicit allowlist: a wildcard cannot be
   * combined with credentials, and reflecting whatever Origin arrives would let
   * any site call the API with the visitor's session.
   *
   * Origins, not URLs: scheme, host and port, no trailing path or slash
   * ("https://admin.iigl.org"). This is compared against the browser's Origin
   * header, which never carries a path, so a stray slash silently matches
   * nothing.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  /**
   * Send the session cookie on cross-site requests.
   *
   * Off by default, and off is the safer setting. SameSite=Lax means the
   * browser will not attach the session to a request originating from another
   * site, and that refusal is the whole of this API's CSRF defence — there is
   * no token anywhere in the codebase.
   *
   * Turn it on only when the panel is served from a different origin than this
   * API (admin.iigl.org calling api.iigl.org). Left off in that arrangement the
   * browser accepts the cookie at sign-in and then declines to send it back, so
   * the login appears to succeed and every request after it is unauthenticated.
   *
   * Two things follow from turning it on: SameSite=None is only honoured
   * alongside Secure, so both sides must be HTTPS; and app.ts adds an Origin
   * check on mutating requests to put back what Lax was doing.
   */
  sessionCrossSite: process.env.SESSION_CROSS_SITE === 'true',
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
  /**
   * The Cashfree payment gateway. Without an app id and secret it is off, and
   * every screen that offers online payment says so instead of offering it.
   *
   * `CASHFREE_ENV` is `sandbox` unless set to `production` — test keys
   * (from the Cashfree dashboard's Test mode) only work against sandbox, and
   * nothing real moves there.
   *
   * `CASHFREE_NOTIFY_URL` is where Cashfree calls back when a payment settles:
   * this API's `/api/public/payments/webhook`, on a public https address. It is
   * optional — the payer's own browser also asks the API to check the order
   * the moment the checkout closes — but it catches payments whose browser
   * went away before that.
   */
  cashfree: {
    appId: process.env.CASHFREE_APP_ID ?? '',
    // Cashfree's dashboard calls it the Secret Key, its API the client secret: either name works.
    secretKey: process.env.CASHFREE_SECRET_KEY ?? process.env.CASHFREE_CLIENT_SECRET ?? '',
    mode: (process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production',
    apiVersion: process.env.CASHFREE_API_VERSION ?? '2023-08-01',
    notifyUrl: (process.env.CASHFREE_NOTIFY_URL ?? '').trim(),
  },
};
