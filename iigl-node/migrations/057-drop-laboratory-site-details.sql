-- ---------------------------------------------------------------------------
-- 057 — undo 056
--
-- 056 added a website description and a map pin per laboratory, entered by
-- hand. Head office did not want to maintain either: the website places each
-- laboratory by the city already on its record, and says the same line for all
-- of them. Nothing was ever written to these columns (checked before this
-- migration: every row NULL), so dropping them loses nothing.
--
-- A new file rather than deleting 056: 056 is applied and checksummed.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  DROP COLUMN `site_longitude`,
  DROP COLUMN `site_latitude`,
  DROP COLUMN `site_blurb`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users`
--   ADD COLUMN `site_blurb` VARCHAR(255) NULL AFTER `show_on_site`,
--   ADD COLUMN `site_latitude` DECIMAL(9,6) NULL AFTER `site_blurb`,
--   ADD COLUMN `site_longitude` DECIMAL(9,6) NULL AFTER `site_latitude`;
-- ---------------------------------------------------------------------------
