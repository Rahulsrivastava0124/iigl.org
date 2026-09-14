import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import 'dotenv/config';
import type { DB } from './types.js';

const url = new URL(process.env.DATABASE_URL!);

const pool = createPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      /*
        Twenty, not ten.

        The database is not on this machine, and a round trip to it costs about
        45 ms whatever the query is — every table on this screen fits in a
        single page, so the time is latency and not work. That makes the pool
        size, not the SQL, what a request waits on: queries beyond the limit
        queue and go out in waves, and each wave is another 45 ms.

        One `/dashboard/summary` fires about **52** queries. Measured against
        this database, the same fifty-two:

            connectionLimit 10 -> 233 ms   (6 waves)
            connectionLimit 20 -> 145 ms   (3 waves)
            connectionLimit 30 -> 108 ms   (2 waves)

        Twenty halves it and leaves room. Thirty is quicker again, but MySQL
        allows 151 connections by default and they are shared with whatever else
        speaks to this database — the Laravel application included — so a number
        that is fine for one API process becomes a refused connection when there
        are three of them.
      */
      connectionLimit: 20,

      /*
        Keep idle connections alive.

        Opening one costs a TCP handshake and an authentication exchange —
        several round trips, measured at ~150 ms for the pool to warm from one
        connection to ten. Without this, an idle connection is dropped by the
        server or by whatever NAT sits between here and it, and the next request
        after a quiet period pays that again. It is the difference between a
        dashboard that takes 108 ms and one that takes a third of a second every
        time somebody comes back from lunch.
      */
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,

      dateStrings: true,
    });

/*
  A connection the database dropped while idle is reported on the pool. Without
  a listener, an 'error' event with nobody listening is thrown, and thrown
  outside any request. Logged here instead; the pool opens a fresh connection
  for the next query.
*/
pool.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] database connection error (the pool will reconnect):`, err);
});

export const db = new Kysely<DB>({
  dialect: new MysqlDialect({ pool }),
});
