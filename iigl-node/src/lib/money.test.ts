import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportNo } from '../services/report.service.js';
import { caratOf, gstOf } from './money.js';

/**
 * Unit tests for the two calculations that are exactly specified and expensive
 * to get wrong: the certificate number, which is printed on documents already
 * in circulation, and the money arithmetic behind every bill.
 *
 * These need no database and no running server, so they can run in CI on a
 * clean checkout — unlike the sweep and the parity checks.
 */

describe('buildReportNo', () => {
  // Verified against live rows: 122600012608 is laboratory 12, day 26,
  // first certificate of the day, August 2026.
  it('reproduces a real certificate number', () => {
    assert.equal(buildReportNo(12, 1, new Date('2026-08-26T10:00:00')), '122600012608');
  });

  it('reproduces a second real one', () => {
    assert.equal(buildReportNo(9, 1, new Date('2026-08-26T10:00:00')), '092600012608');
  });

  it('pads a single digit laboratory id to two characters', () => {
    assert.equal(buildReportNo(4, 1, new Date('2026-08-24T10:00:00')).slice(0, 2), '04');
  });

  it('does not pad a two digit laboratory id', () => {
    assert.equal(buildReportNo(14, 1, new Date('2026-08-24T10:00:00')).slice(0, 2), '14');
  });

  it('pads the daily counter to four characters', () => {
    assert.equal(buildReportNo(12, 7, new Date('2026-08-26T10:00:00')), '122600072608');
    assert.equal(buildReportNo(12, 1234, new Date('2026-08-26T10:00:00')), '122612342608');
  });

  it('pads the day and the month', () => {
    assert.equal(buildReportNo(12, 1, new Date('2026-01-05T10:00:00')), '120500012601');
  });

  it('always produces twelve characters', () => {
    for (const [lab, count, iso] of [
      [1, 1, '2026-01-01T00:00:00'],
      [99, 9999, '2026-12-31T23:59:59'],
      [12, 42, '2027-06-15T12:00:00'],
    ] as const) {
      assert.equal(buildReportNo(lab, count, new Date(iso)).length, 12);
    }
  });
});

describe('gstOf', () => {
  // The original calls parseInt() on the result, so it truncates.
  it('truncates rather than rounding', () => {
    assert.equal(gstOf(660), 778); // 778.8
    assert.equal(gstOf(110), 129); // 129.8
    assert.equal(gstOf(10), 11); // 11.8
  });

  it('leaves an exact result alone', () => {
    assert.equal(gstOf(100), 118);
    assert.equal(gstOf(50), 59);
  });

  it('handles zero', () => {
    assert.equal(gstOf(0), 0);
  });
});

describe('caratOf', () => {
  it('reads a plain number', () => {
    assert.equal(caratOf('5.00'), 5);
    assert.equal(caratOf('10.28'), 10.28);
  });

  // carat_weight is a varchar and the live data is not all numeric. MySQL
  // compares such strings by their leading numeric prefix, and the PHP priced
  // them off that prefix, so this has to match.
  it('takes the leading numeric prefix, as MySQL does', () => {
    assert.equal(caratOf('8..00'), 8);
    assert.equal(caratOf('2.276 gm        /            0.22'), 2.276);
    assert.equal(caratOf('2.10carat   \\             2.31'), 2.1);
  });

  it('falls back to zero when there is no number at all', () => {
    assert.equal(caratOf(''), 0);
    assert.equal(caratOf(null), 0);
    assert.equal(caratOf('not a weight'), 0);
  });

  it('ignores surrounding whitespace', () => {
    assert.equal(caratOf('  3.5  '), 3.5);
  });
});
