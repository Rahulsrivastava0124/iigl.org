import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sameState } from './geocode.service.js';

/**
 * The states as the laboratories' records actually spell them, against the
 * spellings Nominatim answers with. Nothing here talks to the geocoder: this
 * is the comparison that decides whether a city found on its own belongs to
 * the laboratory's state, and a pin in the wrong state is the failure it
 * guards against.
 */
describe('sameState', () => {
  it('ignores spacing and case', () => {
    assert.ok(sameState('West Bengal', 'Westbengal'));
    assert.ok(sameState('Uttar Pradesh', 'UTTARPRADESH'));
    assert.ok(sameState('Odisha', 'ODISHA'));
  });

  it('forgives a letter or two', () => {
    assert.ok(sameState('Jharkhand', 'Jarkhand'));
    assert.ok(sameState('West Bengal', 'WESTBANGAL'));
    assert.ok(sameState('Odisha', 'Orissa'));
  });

  it('still tells two states apart', () => {
    assert.ok(!sameState('Punjab', 'Odisha'));
    assert.ok(!sameState('Bihar', 'Jharkhand'));
    assert.ok(!sameState('Goa', 'Assam'));
    assert.ok(!sameState('West Bengal', ''));
  });
});
