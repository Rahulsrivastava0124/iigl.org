-- ---------------------------------------------------------------------------
-- 035 — the shared holiday list is 0, not NULL
--
-- 034 used NULL for "head office's list, which applies to everybody" and put a
-- unique key on (lab_id, date) to keep one entry per list per date.
--
-- That key does not do what it says. MySQL treats every NULL as distinct in a
-- unique index, so any number of rows may share (NULL, '2026-01-26') — and the
-- one list where a duplicate is most likely, the shared one everybody reads,
-- was the one list with no protection at all. Verified before this file was
-- written: a second Republic Day inserted without complaint.
--
-- So the shared list is `0`. No user has id 0, the column is NOT NULL, and the
-- unique key means what it says for both lists.
--
-- Nothing to convert in practice — the table is empty — but the UPDATE is here
-- because "in practice" is not a guarantee about another database.
-- ---------------------------------------------------------------------------

UPDATE `holidays` SET `lab_id` = 0 WHERE `lab_id` IS NULL;

ALTER TABLE `holidays`
  MODIFY COLUMN `lab_id` bigint unsigned NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `holidays` MODIFY COLUMN `lab_id` bigint unsigned DEFAULT NULL;
-- UPDATE `holidays` SET `lab_id` = NULL WHERE `lab_id` = 0;
-- ---------------------------------------------------------------------------
