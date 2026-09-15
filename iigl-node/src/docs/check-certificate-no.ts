/**
 * Course certificate numbering: the count is read past the random tail.
 *
 *   npm run check:certificate-no
 *
 * A count read wrong gives two students the same certificate number, and the
 * column is unique — so the second issue fails at the insert, in front of
 * whoever is printing it.
 */
import assert from 'node:assert';
import { nextCount } from '../routes/student-certificate.routes.js';

const prefix = 'IIGL-C-2026-';

// The year's first certificate.
assert.equal(nextCount(null, prefix), 1);
assert.equal(nextCount(undefined, prefix), 1);

// Numbered before the tail existed, and after it: both read the same count.
assert.equal(nextCount('IIGL-C-2026-0007', prefix), 8);
assert.equal(nextCount('IIGL-C-2026-0007-7QF4', prefix), 8);
assert.equal(nextCount('IIGL-C-2026-0099-ZZZZ', prefix), 100);
assert.equal(nextCount('IIGL-C-2026-9999-2345', prefix), 10000);

// A tail that opens with digits is still the tail, not part of the count.
assert.equal(nextCount('IIGL-C-2026-0042-2468', prefix), 43);

console.log('certificate numbering: 7 checks passed');
