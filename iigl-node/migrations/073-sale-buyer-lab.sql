-- ---------------------------------------------------------------------------
-- 073 — a sale knows which laboratory bought it
--
-- sales.lab_id is the seller — head office, whose books the row is in — and
-- party_name is the laboratory it was sold to, typed as a name. A name is not
-- an account: it cannot be joined on, it breaks the day somebody is renamed,
-- and it is why a laboratory could not see head office's sale to it as one of
-- its own purchases.
--
-- buyer_lab_id names that laboratory. Nullable, because a sale may be to
-- somebody who is not a laboratory at all.
--
-- Backfilled by exact name against the laboratory accounts, which is how the
-- rows were written: the panel picks the laboratory from a list and sends its
-- fullname.
-- ---------------------------------------------------------------------------

ALTER TABLE `sales` ADD COLUMN `buyer_lab_id` INT UNSIGNED NULL DEFAULT NULL AFTER `lab_id`;

UPDATE `sales` s
  JOIN `users` u ON u.`fullname` = s.`party_name` AND u.`role_id` = 2
SET s.`buyer_lab_id` = u.`id`
WHERE s.`buyer_lab_id` IS NULL;
