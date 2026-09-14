import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { setting } from './settings.service.js';

const TEMPLATES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates');

/**
 * The company letterhead, rendered to HTML, for every printed document.
 *
 * A module of its own rather than a function in document.service, because the
 * commission statements live in statement.service and both need it: kept here,
 * it depends on Settings and nothing else, so neither service has to import
 * the other.
 *
 * Rendered once in code and handed to each template as a string to drop in
 * with `<%- letterhead %>`, rather than as an EJS include. Some documents render
 * with `async: true` and some without, and an include has to be awaited in one
 * mode and must not be in the other — a string works the same in both.
 */
export async function letterheadHtml(): Promise<string> {
  const [logo, ...values] = await Promise.all([
    readFile(path.join(TEMPLATES, 'iigl-logo.png')).then((b) => `data:image/png;base64,${b.toString('base64')}`),
    ...['name', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'gstin', 'website'].map((k) =>
      setting(`company.${k}`),
    ),
  ]);
  const [name, address, city, state, pincode, phone, email, gstin, website] = values;
  return ejs.renderFile(path.join(TEMPLATES, '_letterhead.ejs'), {
    logo,
    company: { name, address, city, state, pincode, phone, email, gstin, website },
  });
}
