-- ---------------------------------------------------------------------------
-- 055 — a course's title and sub title on the website
--
-- The course name is what an enrolment and a certificate say ("Diploma in
-- Navrant Gems Stone"). The website card wants its own heading and a short line
-- under it, written for somebody browsing rather than for the register.
--
--   title     the card heading
--   subtitle  the line under it
--
-- Additive and nullable. Nothing existing is read, written or dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `courses`
  ADD COLUMN `title`    VARCHAR(150) NULL DEFAULT NULL AFTER `lessons`,
  ADD COLUMN `subtitle` VARCHAR(255) NULL DEFAULT NULL AFTER `title`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `courses` DROP COLUMN `subtitle`, DROP COLUMN `title`;
-- ---------------------------------------------------------------------------
