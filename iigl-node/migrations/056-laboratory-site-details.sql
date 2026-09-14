-- ---------------------------------------------------------------------------
-- 056 — what the website says about a laboratory, and where its pin goes
--
-- The website's Branches section draws each listed laboratory as a pin on a
-- map of India, with a line about it. A laboratory record has a city and a
-- state but nothing a map can place, and no sentence meant for the public.
--
--   site_blurb      one line for visitors — "Gem testing laboratory and
--                   institute". NULL shows a plain default.
--   site_latitude   the pin. NULL on either falls back to the middle of the
--   site_longitude  laboratory's state, so a ticked laboratory still appears.
--
-- DECIMAL(9,6): six places is about a tenth of a metre, far finer than the
-- map, and exact where a FLOAT would round what was typed.
--
-- Additive, all nullable. 055 is applied and checksummed, so a new file.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `site_blurb` VARCHAR(255) NULL AFTER `show_on_site`,
  ADD COLUMN `site_latitude` DECIMAL(9,6) NULL AFTER `site_blurb`,
  ADD COLUMN `site_longitude` DECIMAL(9,6) NULL AFTER `site_latitude`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users`
--   DROP COLUMN `site_longitude`,
--   DROP COLUMN `site_latitude`,
--   DROP COLUMN `site_blurb`;
-- ---------------------------------------------------------------------------
