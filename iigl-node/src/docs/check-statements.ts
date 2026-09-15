/**
 * Commission statements: periods, due dates, oldest-first payments and the lock.
 *
 *   npm run check:statements
 */
import assert from 'node:assert';
import { buildStatements, type StatementLine } from '../services/statement.service.js';

const line = (day: string, commission: number): StatementLine => ({
  id: 1, order_no: 'x', day, status: 'delivered', collected: 0, pieces: 1, commission,
});
const run = (o: Partial<Parameters<typeof buildStatements>[0]>) =>
  buildStatements({ startsOn: '2026-09-01', months: 1, graceDays: 15, today: '2026-09-12', lines: [], paid: 0, pending: 0, ...o });

// Inside the first month: nothing billed yet.
let b = run({ lines: [line('2026-09-05', 100)] });
assert.equal(b.periods.length, 0);
assert.equal(b.current?.commission, 100);
assert.equal(b.current?.billed_on, '2026-10-01');
assert.equal(b.standing, 'clear');

// Billed on the 1st, due 15 days later: the grace days.
b = run({ lines: [line('2026-09-05', 100)], today: '2026-10-05' });
assert.equal(b.periods[0].billed_on, '2026-10-01');
assert.equal(b.periods[0].due_on, '2026-10-16');
assert.equal(b.standing, 'grace');
assert.equal(b.reminder?.days_left, 11);

// On the due date it is still due; the day after, locked.
assert.equal(run({ lines: [line('2026-09-05', 100)], today: '2026-10-16' }).standing, 'grace');
b = run({ lines: [line('2026-09-05', 100)], today: '2026-10-17' });
assert.equal(b.standing, 'locked');
assert.equal(b.reminder?.overdue_days, 1);

// Paid in full: clear. A pending payment does not count until approved.
assert.equal(run({ lines: [line('2026-09-05', 100)], today: '2026-10-17', paid: 100 }).standing, 'clear');
assert.equal(run({ lines: [line('2026-09-05', 100)], today: '2026-10-17', pending: 100 }).standing, 'locked');

// Oldest first: 120 pays September's 100 and 20 of October's 50.
b = run({ lines: [line('2026-09-05', 100), line('2026-10-09', 50)], today: '2026-11-20', paid: 120 });
const [oct, sep] = b.periods;
assert.equal(sep.state, 'paid');
assert.equal(oct.balance, 30);
assert.equal(oct.state, 'overdue');
assert.equal(b.outstanding, 30);
assert.equal(b.reminder?.key, '2026-10');

// A month with nothing earned is billed at zero and is paid.
b = run({ today: '2026-10-20' });
assert.equal(b.periods[0].commission, 0);
assert.equal(b.standing, 'clear');

// Quarterly: July to September, billed on 1 October.
b = run({ startsOn: '2026-07-01', months: 3, today: '2026-10-02', lines: [line('2026-08-01', 40)] });
assert.equal(b.periods[0].from, '2026-07-01');
assert.equal(b.periods[0].to, '2026-09-30');
assert.equal(b.periods[0].commission, 40);

// No grace days: due the day it is billed.
assert.equal(run({ lines: [line('2026-09-05', 1)], graceDays: 0, today: '2026-10-01' }).standing, 'grace');
assert.equal(run({ lines: [line('2026-09-05', 1)], graceDays: 0, today: '2026-10-02' }).standing, 'locked');

// None: one statement from billing start to today, billed today, never locked.
b = run({ months: 0, today: '2026-10-20', lines: [line('2026-09-05', 100), line('2026-10-09', 50)], paid: 30 });
assert.equal(b.periods.length, 1);
assert.equal(b.periods[0].from, '2026-09-01');
assert.equal(b.periods[0].to, '2026-10-20');
assert.equal(b.periods[0].billed_on, '2026-10-20');
assert.equal(b.periods[0].commission, 150);
assert.equal(b.outstanding, 120);
assert.equal(b.periods[0].state, 'due');
assert.equal(b.current, null);
assert.equal(b.standing, 'clear');
assert.equal(b.reminder, null);
assert.equal(run({ months: 0, today: '2027-06-01', lines: [line('2026-09-05', 100)] }).standing, 'clear', 'unpaid for months, never locked');
assert.equal(run({ months: 0, today: '2026-10-20', lines: [line('2026-09-05', 100)], paid: 100 }).periods[0].state, 'paid');
assert.equal(run({ months: 0, startsOn: '2026-12-01', today: '2026-10-20' }).periods.length, 0, 'billing not started yet');

console.log('statements: 35 checks passed');
