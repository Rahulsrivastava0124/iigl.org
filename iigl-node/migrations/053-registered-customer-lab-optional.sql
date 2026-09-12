-- ---------------------------------------------------------------------------
-- 053 — a registered customer need not belong to a laboratory
--
-- Head office registers customers too, and not every one of them is a
-- particular laboratory's: a trade customer head office deals with directly
-- has no franchise to be filed under, and the form made head office pick one
-- anyway. `lab_id` may now be empty, which means head office's own customer.
--
-- A laboratory still only ever sees customers registered with it; one with no
-- laboratory is visible to head office alone.
--
-- The unique key on (lab_id, mobile) stays. MySQL lets NULLs repeat under a
-- unique key, so the API checks head office's own customers for a repeated
-- mobile itself.
--
-- Loosens a constraint; no existing row is read or changed.
-- ---------------------------------------------------------------------------

ALTER TABLE `registered_customers`
  MODIFY COLUMN `lab_id` INT NULL DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `registered_customers` MODIFY COLUMN `lab_id` INT NOT NULL;
--
-- Fails while any customer has no laboratory; give those one, or delete them,
-- first.
-- ---------------------------------------------------------------------------
