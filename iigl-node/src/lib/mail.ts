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

export async function sendPasswordReset(to: string, url: string, name: string): Promise<void> {
  const transport = await transportFor();
  if (!transport) {
    if (env.isProd) {
      throw new Error('SMTP_URL is not set, so password reset mail cannot be sent.');
    }
    console.info(`[dev] password reset for ${to}: ${url}`);
    return;
  }

  await transport.sendMail({
    from: await setting('mail.from'),
    to,
    subject: 'Reset your IIGL password',
    text: [
      `Hello ${name},`,
      '',
      'Someone asked to reset the password on your IIGL account. Open the link',
      'below to choose a new one. It stops working in an hour.',
      '',
      url,
      '',
      'If this was not you, nothing has changed and you can ignore this message.',
    ].join('\n'),
  });
}
