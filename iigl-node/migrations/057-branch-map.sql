-- ---------------------------------------------------------------------------
-- 057 — what the website shows about a branch, beside its page
--
-- The website's Our Branches section lists each branch with its state and a
-- short line, and pins it on a map of India. None of that had a column, so it
-- was typed into the site's code and a branch added in the panel appeared
-- nowhere on the map. These make Website Setup › Branches the whole record.
--
--   state  as the list prints it — "West Bengal"
--   blurb  the line under the city — "Gem testing laboratory"
--   lat    where the pin sits, decimal degrees
--   lon
--
-- Additive and nullable. `branches` held no rows when this was written.
-- ---------------------------------------------------------------------------

ALTER TABLE `branches`
  ADD COLUMN `state` VARCHAR(60)  NULL DEFAULT NULL AFTER `city`,
  ADD COLUMN `blurb` VARCHAR(120) NULL DEFAULT NULL AFTER `state`,
  ADD COLUMN `lat`   DECIMAL(9,6) NULL DEFAULT NULL AFTER `blurb`,
  ADD COLUMN `lon`   DECIMAL(9,6) NULL DEFAULT NULL AFTER `lat`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `branches` DROP COLUMN `lon`, DROP COLUMN `lat`, DROP COLUMN `blurb`, DROP COLUMN `state`;
-- ---------------------------------------------------------------------------
