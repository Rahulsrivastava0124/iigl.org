/**
 * The one thing worth a check here: mail that cannot be sent must say so.
 *
 * Both branches used to end in a reply the person believed — "a link is on its
 * way" with nothing sent, or "something went wrong on our side" when it was
 * the mail account that was refused. Run with a DATABASE_URL that does not
 * answer, so every setting falls back to the environment and no row is touched:
 *
 *   DATABASE_URL=mysql://x:x@127.0.0.1:1/x SMTP_URL= npm run check:mail
 */
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { sendPasswordReset } from '../lib/mail.js';

const send = () =>
  sendPasswordReset('nobody@example.invalid', 'http://x/y', 'Nobody', new Date(Date.now() + 3600e3));

async function main() {
  if (process.argv.includes('--refused')) {
    await assert.rejects(send(), /mail server refused/, 'a dead mail server reported success');
    return;
  }
  assert.ok(!process.env.SMTP_URL, 'run with SMTP_URL empty');

  // Nothing configured: refuses rather than returning quietly.
  await assert.rejects(send(), /No SMTP server is configured/, 'unconfigured mail reported success');

  // Configured but refused: says what the server said. A second process,
  // because the environment is read once at import and re-importing this
  // module would not re-read it.
  const dead = spawnSync(process.execPath, [...process.execArgv, process.argv[1], '--refused'], {
    env: { ...process.env, SMTP_URL: 'smtp://127.0.0.1:1' },
    encoding: 'utf8',
  });
  assert.strictEqual(dead.status, 0, `refused-server case failed:\n${dead.stdout}${dead.stderr}`);

  console.log('mail checks passed');
}

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
