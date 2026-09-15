-- ---------------------------------------------------------------------------
-- 062 — a blog article's card, and a course's full write-up
--
-- blogs    the website lists articles as cards: a short description, the
--          category, who wrote it and the date it is published. `thumbnail`
--          (the card picture) was already here and simply never offered.
--
--   excerpt       VARCHAR(255)  the line under the title on the card
--   category      VARCHAR(60)
--   author        VARCHAR(100)
--   published_on  DATE          shown on the card; blank shows the date added
--
-- courses  the page behind "View Course": the full description, and the
--          syllabus as one topic per line.
--
--   details   TEXT
--   syllabus  TEXT
--
-- Additive and nullable. `blogs` held no rows when this was written.
-- ---------------------------------------------------------------------------

ALTER TABLE `blogs`
  ADD COLUMN `excerpt`      VARCHAR(255) NULL DEFAULT NULL AFTER `page_name`,
  ADD COLUMN `category`     VARCHAR(60)  NULL DEFAULT NULL AFTER `excerpt`,
  ADD COLUMN `author`       VARCHAR(100) NULL DEFAULT NULL AFTER `category`,
  ADD COLUMN `published_on` DATE         NULL DEFAULT NULL AFTER `author`;

ALTER TABLE `courses`
  ADD COLUMN `details`  TEXT NULL DEFAULT NULL AFTER `subtitle`,
  ADD COLUMN `syllabus` TEXT NULL DEFAULT NULL AFTER `details`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `courses` DROP COLUMN `syllabus`, DROP COLUMN `details`;
-- ALTER TABLE `blogs` DROP COLUMN `published_on`, DROP COLUMN `author`, DROP COLUMN `category`, DROP COLUMN `excerpt`;
-- ---------------------------------------------------------------------------
