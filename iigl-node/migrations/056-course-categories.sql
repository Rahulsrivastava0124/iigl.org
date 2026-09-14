-- ---------------------------------------------------------------------------
-- 056 — a course's categories, typed rather than chosen
--
-- 054 gave a course one `track` out of a fixed four (gemology, jewellery,
-- certification, fundamentals). Those four were placeholders. A course now
-- carries its own list of categories, typed in the panel, as a JSON array of
-- strings: ["Gemology", "Diamonds"]. The website's filter buttons are whatever
-- categories the offered courses hold.
--
-- `track` was never filled on any course (checked before writing: no row held
-- a value), so the column is renamed and retyped in place; nothing is lost.
-- ---------------------------------------------------------------------------

ALTER TABLE `courses`
  CHANGE COLUMN `track` `categories` JSON NULL DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `courses` CHANGE COLUMN `categories` `track` VARCHAR(20) NULL DEFAULT NULL;
-- ---------------------------------------------------------------------------
