/**
 * Where a password reset link points: back at the panel that asked, and never
 * at an address that is not one of the panels.
 *
 *   npm run check:reset-link
 */
import assert from 'node:assert';
import type { Request } from 'express';

// The production doors, set before the environment is read.
process.env.CORS_ORIGINS = 'https://admin.iigl.org,https://super.iigl.org,https://team.iigl.org';
const { panelAddressFor } = await import('../lib/session.js');

const from = (origin: string | undefined, portal?: string, host = 'api.iigl.org') =>
  panelAddressFor({
    query: portal ? { portal } : {},
    get: (h: string) => (h.toLowerCase() === 'origin' ? origin : h.toLowerCase() === 'host' ? host : undefined),
  } as unknown as Request);

// Each door gets a link to itself.
assert.equal(from('https://super.iigl.org', 'super'), 'https://super.iigl.org');
assert.equal(from('https://admin.iigl.org', 'admin'), 'https://admin.iigl.org');
assert.equal(from('https://team.iigl.org', 'team'), 'https://team.iigl.org');
assert.equal(from('https://team.iigl.org'), 'https://team.iigl.org', 'no portal named: the address as it came');

// Development: the subdomain doors, and the doors told apart by path.
assert.equal(from('http://admin.localhost:5173', 'admin'), 'http://admin.localhost:5173');
assert.equal(from('http://localhost:5173', 'team'), 'http://localhost:5173/team');
assert.equal(from('http://localhost:5173', 'super'), 'http://localhost:5173', 'the bare address is head office');

// Anything that is not one of the panels is refused, never used for a link.
assert.equal(from('https://evil.example', 'super'), null);
assert.equal(from('https://super.iigl.org.evil.example', 'super'), null);
assert.equal(from('https://evil.example', 'super', 'evil.example'), null, 'a matching Host header proves nothing');
assert.equal(from('http://super.iigl.org', 'super'), null, 'the listed address is https');
assert.equal(from(undefined, 'super'), null, 'no Origin at all');
assert.equal(from('null', 'super'), null, 'a sandboxed page');

console.log('Reset links: back to the panel that asked, and only to a listed panel address.');
