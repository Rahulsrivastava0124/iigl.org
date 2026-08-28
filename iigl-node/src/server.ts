import { createApp } from './app.js';
import { env } from './lib/env.js';
import { db } from './db/index.js';
import { closeBrowser } from './services/pdf.service.js';

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`iigl-api listening on http://localhost:${env.port}`);
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
