import nodemailer from 'nodemailer';
import { env } from './env.js';

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
const transport = env.smtpUrl ? nodemailer.createTransport(env.smtpUrl) : null;

export const mailConfigured = Boolean(transport);

export async function sendPasswordReset(to: string, url: string, name: string): Promise<void> {
  if (!transport) {
    if (env.isProd) {
      throw new Error('SMTP_URL is not set, so password reset mail cannot be sent.');
    }
    console.info(`[dev] password reset for ${to}: ${url}`);
    return;
  }

  await transport.sendMail({
    from: env.mailFrom,
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
