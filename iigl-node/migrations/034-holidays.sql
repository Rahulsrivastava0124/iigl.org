-- ---------------------------------------------------------------------------
-- 034 — holidays, scoped to a list
--
-- The days the office is shut. Attendance records who came in; nothing recorded
-- which days nobody was expected to, so a national holiday and a person who did
-- not turn up were the same blank square on the calendar and the same missing
-- day in the salary arithmetic.
--
-- `holidays` already exists — Laravel created it and never wrote to it or read
-- it: no model, no controller, no view, and zero rows here. So this is an ALTER
-- rather than a CREATE. Its columns are kept as Laravel named them, `occasion`
-- included, because renaming a ported column to suit one new screen is how two
-- names for one thing start.
--
-- What is added is the one thing it has no way to say: whose list a day is on.
--
--   lab_id   NULL is head office's list, which applies to everybody: Republic
--            Day is not one laboratory's opinion. A laboratory's own id is its
--            own list — a local festival, a shutdown for a wedding — which only
--            it and its staff see.
--
-- One row per date per list, which is what the unique key says: a second
-- "Diwali" on one date is a mistake every time, and everything that reads this
-- counts days.
--
-- Head office's list and a laboratory's may name the same date. That is not a
-- conflict — the readers count distinct dates, so a local holiday falling on a
-- national one is one day off, not two.
-- ---------------------------------------------------------------------------

ALTER TABLE `holidays`
  ADD COLUMN `lab_id` bigint unsigned DEFAULT NULL AFTER `id`,
  ADD UNIQUE KEY `holidays_list_date_unique` (`lab_id`, `date`),
  ADD KEY `holidays_date_index` (`date`);

-- `status` and `userid` are NOT NULL with no default, which makes an insert
-- that forgets them fail rather than record a holiday nobody can trace. Both
-- get one: active, and nobody, so the columns describe rows written before
-- anybody was recorded rather than refusing them.
ALTER TABLE `holidays`
  MODIFY COLUMN `status` int NOT NULL DEFAULT 1,
  MODIFY COLUMN `userid` int NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `holidays`
--   DROP KEY `holidays_list_date_unique`,
--   DROP KEY `holidays_date_index`,
--   DROP COLUMN `lab_id`;
-- ---------------------------------------------------------------------------
