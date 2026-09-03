import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { env } from './env.js';
import { setting } from '../services/settings.service.js';

/**
 * Outgoing mail.
 *
 * Only one message is sent by this application — a password reset — so there is
 * one transport and one function, configured from `SMTP_URL`.
 *
 * When SMTP is not configured the behaviour differs by environment on purpose:
 * development logs the link to the console so the flow can be walked end to
 * end without a mail server, and production refuses. A reset that reports
 * success while going nowhere is the one outcome worth ruling out — the person
 * waits for mail that will never arrive, and nothing anywhere says why.
 */
/**
 * Built per send rather than once, because the connection string is now a
 * setting: a transport made at import time would hold whatever `.env` said
 * until the process restarted, and somebody who has just corrected the SMTP
 * URL on the Settings screen expects the next reset mail to use it.
 *
 * The setting falls back to `SMTP_URL`, so an installation that has never
 * opened the screen behaves exactly as it did.
 */
async function transportFor() {
  const url = await setting('mail.smtp_url');
  return url ? nodemailer.createTransport(url) : null;
}

/** Whether mail can be sent at all, for the screens that say so. */
export const mailConfigured = Boolean(env.smtpUrl);

/**
 * The mark at the top of the mail.
 *
 * Sent as an attachment and referenced by `cid:`, not as a `data:` URI: Gmail
 * and Outlook both strip a data URI out of an <img>, so the one approach that
 * renders everywhere is the one the mail carries with it. Read once and kept —
 * the file does not change while the process runs.
 *
 * Missing, the mail goes out without it. A password reset that fails because a
 * logo could not be read would be the wrong thing to break.
 */
const LOGO_CID = 'iigl-logo';
let logoFile: Buffer | null | undefined;

async function logo(): Promise<Buffer | null> {
  if (logoFile !== undefined) return logoFile;
  try {
    const file = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../templates/iigl-logo.png',
    );
    logoFile = await readFile(file);
  } catch {
    logoFile = null;
  }
  return logoFile;
}

/** Anything a person typed, safe to drop into markup. */
const escape = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The reset mail, as markup.
 *
 * A button, not a printed address. A reset URL is ninety characters of token
 * and looks exactly like the thing people are told never to click; a button
 * carrying the company's own name reads as something the company sent.
 *
 * Tables and inline styles throughout, because that is what mail clients
 * render — Outlook ignores a stylesheet and most of flexbox. The address still
 * travels in the plain-text alternative, which is what a client that strips
 * markup falls back to, so the mail works everywhere without the URL being
 * shown to somebody who has a button in front of them.
 */
function resetHtml(
  url: string,
  name: string,
  company: string,
  expires: string,
  withLogo: boolean,
): string {
  const navy = '#061948';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#3c4252">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0;background:#ffffff">
    <tr><td style="padding:20px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
        ${
          withLogo
            ? `<td style="padding-right:10px" valign="middle"><img src="cid:${LOGO_CID}" width="36" height="36" alt="" style="display:block;border:0"></td>`
            : ''
        }
        <td valign="middle">
          <p style="margin:0;font-size:18px;font-weight:600;color:${navy}">${escape(company)}</p>
          <p style="margin:0;font-size:13px;color:#4a5265">Password reset</p>
        </td>
      </tr></table>

      <p style="margin:0 0 12px;font-size:15px">Hello ${escape(name)},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5">
        Someone asked to reset the password on your account. Choose a new one with the
        button below.
      </p>

      <!--
        The moment it stops working, not "in an hour". An hour from when — the
        mail was sent, or read? A time answers that without arithmetic, and a
        mail read the next morning says plainly that it is too late.
      -->
      <p style="margin:0 0 24px;font-size:14px;color:#4a5265">
        This link works until <strong style="color:#3c4252">${escape(expires)}</strong>.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:${navy};border-radius:6px">
          <a href="${escape(url)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Choose a new password</a>
        </td>
      </tr></table>

      <p style="margin:24px 0 0;font-size:13px;color:#4a5265;line-height:1.5">
        If this was not you, nothing has changed and you can ignore this message.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * When a reset link stops working, written out for the person reading it.
 *
 * In India's time zone rather than the server's: the people this is sent to
 * are in one place, and a time in UTC is a time somebody has to convert while
 * already locked out.
 */
function expiresAt(at: Date): string {
  return at.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export async function sendPasswordReset(
  to: string,
  url: string,
  name: string,
  /** When the link stops working. */
  expires: Date,
): Promise<void> {
  const transport = await transportFor();
  if (!transport) {
    if (env.isProd) {
      throw new Error('SMTP_URL is not set, so password reset mail cannot be sent.');
    }
    console.info(`[dev] password reset for ${to} (until ${expiresAt(expires)}): ${url}`);
    return;
  }

  const company = await setting('company.name');
  const until = expiresAt(expires);
  const mark = await logo();

  await transport.sendMail({
    from: await setting('mail.from'),
    to,
    subject: `Reset your ${company} password`,
    html: resetHtml(url, name, company, until, Boolean(mark)),
    attachments: mark
      ? [{ filename: 'logo.png', content: mark, cid: LOGO_CID, contentType: 'image/png' }]
      : undefined,
    // The alternative a text-only client falls back to. It carries the address
    // because there is no button to press in plain text.
    text: [
      `Hello ${name},`,
      '',
      `Someone asked to reset the password on your ${company} account. Open the`,
      'address below to choose a new one.',
      '',
      `This link works until ${until}.`,
      '',
      url,
      '',
      'If this was not you, nothing has changed and you can ignore this message.',
    ].join('\n'),
  });
}
