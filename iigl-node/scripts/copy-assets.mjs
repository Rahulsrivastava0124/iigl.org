/**
 * Copies the non-TypeScript assets into the build.
 *
 * `tsc` emits JavaScript and nothing else, so the EJS templates and the images
 * beside them never reached `dist/`. Everything that renders a document — the
 * order receipt, the franchisee form, the agreement, the fee statement, the
 * cards, and the logo the mailer inlines — resolves its template relative to
 * its own compiled file, so under `npm start` every one of them failed with
 * ENOENT while working perfectly under `tsx`, which runs from `src/`.
 *
 * Kept as a build step rather than by reading the templates out of `src/` at
 * runtime: a deployment ships `dist/` alone, and a path pointing back into the
 * sources would be a file that is not there.
 */
import { cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Everything under `src/` that `tsc` does not emit. */
const ASSETS = [['src/templates', 'dist/templates']];

for (const [from, to] of ASSETS) {
  const source = resolve(root, from);
  if (!existsSync(source)) {
    console.error(`copy-assets: ${from} is missing`);
    process.exit(1);
  }
  cpSync(source, resolve(root, to), { recursive: true });
  console.log(`copy-assets: ${from} -> ${to}`);
}
