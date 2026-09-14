/**
 * Who may read an uploaded file without signing in.
 *
 *   npm run check:files
 *
 * The website's three folders are public, every other folder needs a session, and
 * no path with a dot segment reaches either — so a public folder cannot be used
 * to name a private file. Requests go out through node:http, which sends the
 * path as written; fetch would tidy `..` away before the server saw it.
 */
import assert from 'node:assert';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';

const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address() as AddressInfo;

const status = (path: string) =>
  new Promise<number>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: `/api/files${path}` }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on('error', reject);
  });

let failed = false;
try {
  for (const path of [
    '/website/../signature/a.png',
    '/website/%2e%2e/signature/a.png',
    '/website/..%5Csignature/a.png',
    '/website/./a.png',
    '/banner/%E0%A4%A/a.png',
  ]) {
    assert.equal(await status(path), 404, `refused: ${path}`);
  }

  for (const path of ['/signature/a.png', '/employee/a.png', '/documentation/a.pdf', '/report/a.png', '/websiteX/a.png', '/website%2Fa.png']) {
    assert.equal(await status(path), 401, `needs a session: ${path}`);
  }

  for (const path of ['/website/check-files.webp', '/banner/check-files.png', '/icon/check-files.webp']) {
    assert.notEqual(await status(path), 401, `public: ${path}`);
  }

  console.log('Uploads: website, banner and icon public, every other folder behind a session, dot segments refused.');
} catch (error) {
  console.error(error);
  failed = true;
} finally {
  server.close();
  process.exit(failed ? 1 : 0);
}
