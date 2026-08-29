import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import 'dotenv/config';
const url = new URL(process.env.DATABASE_URL);
export const db = new Kysely({
    dialect: new MysqlDialect({
        pool: createPool({
            host: url.hostname,
            port: Number(url.port || 3306),
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: url.pathname.slice(1),
            connectionLimit: 10,
            dateStrings: true,
        }),
    }),
});
