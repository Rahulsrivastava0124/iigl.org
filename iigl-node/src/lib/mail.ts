import nodemailer from 'nodemailer';
import { env } from './env.js';
import { ApiError } from './errors.js';
import { setting } from '../services/settings.service.js';

/**
 * Outgoing mail.
 *
 * Two messages are sent: a password reset, and the confirmation to a student who
 * registered on the website. One transport, configured from `SMTP_URL`.
 *
 * When SMTP is not configured, sending refuses — in every environment.
 * Development additionally prints the link so the flow can still be walked
 * without a mail server, but it prints *and* refuses. A reset that reports
 * success while going nowhere is the one outcome worth ruling out: the person
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
): string {
  const navy = '#061948';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#3c4252">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0;background:#ffffff">
    <tr><td style="padding:20px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
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

/**
 * To a student who registered on the website: the number to quote, the course,
 * and that it is pending until head office calls to confirm. The same transport
 * and the same refusals as the reset mail; the caller decides what a refusal
 * means, because the registration is already saved by then.
 */
export async function sendRegistrationReceived(
  to: string,
  r: { name: string; registrationNo: string; course: string },
): Promise<void> {
  const transport = await transportFor();
  if (!transport) {
    throw new ApiError(503, 'No SMTP server is configured, so the registration mail cannot be sent.', 'mail_unconfigured');
  }

  const company = await setting('company.name');
  const navy = '#061948';
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 18px 4px 0;color:#4a5265">${label}</td><td style="padding:4px 0;font-weight:600;color:${navy}">${escape(value)}</td></tr>`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#3c4252">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0;background:#ffffff">
    <tr><td style="padding:20px 24px">
      <p style="margin:0;font-size:18px;font-weight:600;color:${navy}">${escape(company)}</p>
      <p style="margin:0 0 20px;font-size:13px;color:#4a5265">Course registration</p>

      <p style="margin:0 0 12px;font-size:15px">Hello ${escape(r.name)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
        Thank you for registering. Your registration is <strong>pending</strong>: our team will call you to
        confirm the batch, the fees and admission.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px">
        ${row('Registration No.', r.registrationNo)}
        ${row('Course', r.course)}
        ${row('Status', 'Pending')}
      </table>

      <p style="margin:0;font-size:13px;color:#4a5265;line-height:1.5">
        Quote your registration number whenever you contact us. If you did not register, you can ignore this message.
      </p>
    </td></tr>
  </table>
</body></html>`;

  try {
    await transport.sendMail({
      from: await setting('mail.from'),
      to,
      subject: `Your ${company} registration ${r.registrationNo} is received`,
      html,
      text: [
        `Hello ${r.name},`,
        '',
        'Thank you for registering. Your registration is pending: our team will call you to confirm the batch, the fees and admission.',
        '',
        `Registration No.: ${r.registrationNo}`,
        `Course: ${r.course}`,
        'Status: Pending',
        '',
        'Quote your registration number whenever you contact us. If you did not register, you can ignore this message.',
      ].join('\n'),
    });
  } catch (e) {
    throw new ApiError(502, `The mail server refused the message: ${(e as Error).message}`, 'mail_failed');
  }
}

/**
 * The one-time code a student signs in to their portal with.
 *
 * Sent to the email on the student's record. The same transport and refusals as
 * the other messages; a missing SMTP server is reported, so the caller can tell
 * the student a code could not be sent rather than leaving them waiting.
 */
export async function sendStudentOtp(
  to: string,
  code: string,
  name: string,
  /** How many minutes the code is good for. */
  minutes: number,
): Promise<void> {
  const transport = await transportFor();
  if (!transport) {
    if (!env.isProd) console.info(`[dev] student OTP for ${to}: ${code}`);
    throw new ApiError(503, 'No SMTP server is configured, so the sign-in code cannot be sent.', 'mail_unconfigured');
  }

  const company = await setting('company.name');
  const navy = '#061948';
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#3c4252">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0;background:#ffffff">
    <tr><td style="padding:20px 24px">
      <p style="margin:0;font-size:18px;font-weight:600;color:${navy}">${escape(company)}</p>
      <p style="margin:0 0 20px;font-size:13px;color:#4a5265">Student sign-in</p>
      <p style="margin:0 0 12px;font-size:15px">Hello ${escape(name)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Use this code to sign in to your student page:</p>
      <p style="margin:0 0 16px;font-size:30px;font-weight:700;letter-spacing:6px;color:${navy}">${escape(code)}</p>
      <p style="margin:0;font-size:13px;color:#4a5265;line-height:1.5">
        It works for ${minutes} minutes. If you did not ask to sign in, you can ignore this message.
      </p>
    </td></tr>
  </table>
</body></html>`;

  try {
    await transport.sendMail({
      from: await setting('mail.from'),
      to,
      subject: `Your ${company} sign-in code is ${code}`,
      html,
      text: [
        `Hello ${name},`,
        '',
        `Your ${company} sign-in code is ${code}.`,
        `It works for ${minutes} minutes.`,
        '',
        'If you did not ask to sign in, you can ignore this message.',
      ].join('\n'),
    });
  } catch (e) {
    throw new ApiError(502, `The mail server refused the message: ${(e as Error).message}`, 'mail_failed');
  }
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
    // Development still prints the link, so the flow can be walked without a
    // mail server — but it is printed *and* refused, never printed and called
    // success. Returning quietly here is what produced "the reset mail never
    // arrives": the panel said "on its way to r•••@gmail.com" and nothing had
    // been sent, in the one environment where nobody thinks to check.
    if (!env.isProd) {
      console.info(`[dev] password reset for ${to} (until ${expiresAt(expires)}): ${url}`);
    }
    throw new ApiError(
      503,
      'No SMTP server is configured, so the reset mail cannot be sent. Set the SMTP URL ' +
        'on the Settings screen.',
      'mail_unconfigured',
    );
  }

  const company = await setting('company.name');
  const until = expiresAt(expires);

  /*
    A refusal from the mail server is reported as one.

    Anything thrown from here reaches the error handler as an unrecognised
    error and becomes "Something went wrong on our side", which is true and
    tells nobody — least of all head office — that the account's app password
    has expired. The reason from the server is what says which.
  */
  try {
    await transport.sendMail({
      from: await setting('mail.from'),
      to,
      subject: `Reset your ${company} password`,
      // No attachments. The logo used to travel as one, referenced by `cid:`,
      // and Gmail lists an inline image like that as a `logo.png` file at the
      // foot of the message — so a password reset arrived looking like it
      // carried a download. The company name heads the mail on its own.
      html: resetHtml(url, name, company, until),
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
  } catch (e) {
    throw new ApiError(
      502,
      `The mail server refused the message: ${(e as Error).message}`,
      'mail_failed',
    );
  }
}
