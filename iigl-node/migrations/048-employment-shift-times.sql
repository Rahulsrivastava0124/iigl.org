-- ---------------------------------------------------------------------------
-- 048 — when somebody's day starts and ends
--
-- 047 recorded how long a full day is as a number of hours. Whoever sets it
-- up thinks of a shift as a start and an end — half past nine to half past six
-- — and types the hours by doing that sum in their head, which is where 8.5
-- becomes 9. The form now takes the two times, and the hours are worked out
-- from them.
--
-- `working_hours` stays, written from these two whenever they are given, so
-- everything reading it — the calendar's "short" mark — reads it unchanged. A
-- shift that ends after midnight is end + 24h less start.
--
-- On `employements`, beside the rest of the shift. Empty on every existing
-- row, meaning not set.
--
-- Additive and nullable. Nothing existing is read, written or dropped. A new
-- file because 047 is applied and checksummed.
-- ---------------------------------------------------------------------------

ALTER TABLE `employements`
  ADD COLUMN `shift_start` TIME NULL DEFAULT NULL AFTER `week_off`,
  ADD COLUMN `shift_end`   TIME NULL DEFAULT NULL AFTER `shift_start`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `employements` DROP COLUMN `shift_end`, DROP COLUMN `shift_start`;
--
-- `working_hours` keeps the hours they were worked out to.
-- ---------------------------------------------------------------------------
