/**
 * Week off: the parsing, and which days it lands on.
 *
 * One check because one mistake is easy and invisible — `Number('')` is 0, so
 * an empty column parses as Sunday and every posting with no fixed day off is
 * shown one, on the calendar and in the form.
 *
 *   npm run check:week-off
 */
import assert from 'node:assert';

/** The same reading the API and the panel both do. */
const weekOffDays = (stored: string | null | undefined): Set<number> =>
  new Set(
    String(stored ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  );

const off = (set: Set<number>, date: string) => set.has(new Date(`${date}T00:00:00`).getDay());

function main() {
  assert.deepStrictEqual([...weekOffDays('0,6')], [0, 6]);
  assert.deepStrictEqual([...weekOffDays(null)], [], 'no column is no fixed day off');
  assert.deepStrictEqual([...weekOffDays('')], [], "'' must not read as Sunday");
  assert.deepStrictEqual([...weekOffDays(' ')], [], 'nor must a space');
  assert.deepStrictEqual([...weekOffDays('9,x,3')], [3], 'nothing outside 0-6 survives');

  // September 2026: the 5th and 12th are Saturdays, the 6th and 13th Sundays.
  const sunday = weekOffDays('0');
  assert.ok(off(sunday, '2026-09-06'), '6 Sep 2026 is a Sunday');
  assert.ok(off(sunday, '2026-09-13'), '13 Sep 2026 is a Sunday');
  assert.ok(!off(sunday, '2026-09-07'), 'the Monday is not');

  const weekend = weekOffDays('0,6');
  assert.ok(off(weekend, '2026-09-05') && off(weekend, '2026-09-06'), 'both weekend days');
  assert.ok(!off(weekend, '2026-09-08'), 'Tuesday is a working day');

  // And the day nobody is off, for a posting that names none.
  assert.ok(!off(weekOffDays(null), '2026-09-06'), 'no week off means no day painted');

  console.log('week off checks passed');
}

main();
