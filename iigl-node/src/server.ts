import { sql } from 'kysely';
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { db } from './db/index.js';
import { checkStorage } from './lib/storage.js';
import { closeBrowser } from './services/pdf.service.js';

/**
 * What the process reports as it comes up.
 *
 * Both dependencies are reached once here rather than on the first request, so
 * a wrong password or a bucket in the wrong account shows in this listing
 * instead of in somebody's failed save. Neither failure stops the server: the
 * API still serves everything that does not need the failed dependency, and
 * the line says plainly which one is down.
 */
async function reportStatus(): Promise<void> {
  try {
    /*
      Reached once, on every connection in the pool.

      The pool opens lazily, and opening a connection is a TCP handshake and an
      authentication exchange — several round trips to a database that is not on
      this machine. Left to happen on demand, the first request of the morning
      pays for all twenty at once: measured, warming the pool from one
      connection to ten costs about 150 ms, on top of the request's own work.

      Twenty `select 1`s in parallel is one round trip and opens all of them, so
      that cost is paid here, before anybody is waiting, and `enableKeepAlive`
      is what stops it being paid again after an idle spell.
    */
    const t = Date.now();
    await Promise.all(Array.from({ length: 20 }, () => sql`select 1`.execute(db)));
    console.log(
      `  database  ok      ${new URL(env.databaseUrl).pathname.slice(1)} · pool warm in ${Date.now() - t}ms`,
    );
  } catch (err) {
    console.error(`  database  FAILED  ${(err as Error).message}`);
  }

  const storage = await checkStorage();
  if (storage.ok) {
    console.log(`  storage   ok      R2 bucket "${storage.bucket}" at ${storage.endpoint}`);
  } else {
    console.error(`  storage   FAILED  R2: ${storage.reason}`);
  }
}

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`iigl-api listening on http://localhost:${env.port}`);
  void reportStatus();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await closeBrowser();
      await db.destroy();
      process.exit(0);
    });
  });
}
