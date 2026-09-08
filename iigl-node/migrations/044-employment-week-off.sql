-- ---------------------------------------------------------------------------
-- 044 — which day of the week somebody is off
--
-- An employment records what a posting pays and when it started, and nothing
-- about the shape of the week. So a person off every Sunday reads exactly like
-- a person who did not turn up: a blank square on the calendar, and a day
-- counted against them when a month's attendance is totted up.
--
-- Held on `employements` rather than on the account, because it belongs to the
-- posting: someone who moves from a laboratory that closes on Sunday to one
-- that closes on Tuesday has a new week off, and the old employment row should
-- keep saying what was true while it ran.
--
-- Stored as the day numbers JavaScript and MySQL both use — 0 Sunday through 6
-- Saturday — comma separated, because a week off is not always one day: a
-- laboratory on a five-day week gives two.
--
-- Empty on every existing row, which means "no fixed day off" — exactly what
-- those rows said before, since none of them said anything.
--
-- Additive and nullable. Nothing existing is read, written or dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `employements`
  ADD COLUMN `week_off` VARCHAR(20) NULL DEFAULT NULL AFTER `salary`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `employements` DROP COLUMN `week_off`;
--
-- Read the column out first. Nothing else holds it, and the calendar goes back
-- to reading a weekly day off as an absence.
-- ---------------------------------------------------------------------------
