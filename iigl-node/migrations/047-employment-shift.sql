-- ---------------------------------------------------------------------------
-- 047 — how long somebody's day is, and when they count as late
--
-- The calendar could say whether somebody came in and when, and nothing about
-- whether that was on time or a full day: there was nowhere to write down what
-- on time and a full day are. The panel guessed a single ten o'clock for
-- everybody.
--
-- On `employements`, beside `week_off`, for the same reason: it belongs to the
-- posting. A move to a laboratory that opens at eight is a new shift, and the
-- old employment row should keep saying what was true while it ran.
--
--   working_hours  hours in a full day, e.g. 9 or 8.5
--   late_after     the time after which a punch-in is marked late
--
-- Empty on every existing row, meaning not set — and the calendar then marks
-- nobody late or short, which is what it did before.
--
-- Additive and nullable. Nothing existing is read, written or dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `employements`
  ADD COLUMN `working_hours` DECIMAL(4,2) NULL DEFAULT NULL AFTER `week_off`,
  ADD COLUMN `late_after`    TIME         NULL DEFAULT NULL AFTER `working_hours`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `employements` DROP COLUMN `late_after`, DROP COLUMN `working_hours`;
--
-- Read the columns out first. Nothing else holds them.
-- ---------------------------------------------------------------------------
