-- ---------------------------------------------------------------------------
-- 054 — what a course's card on the website says
--
-- The website's Available Courses section shows each course as a card: a
-- picture, a level badge, the name, a line of description, how long it runs,
-- how many lessons, and which filter it sits under. The name, description and
-- duration were already on the course; these are the rest, so the card can be
-- written from the panel rather than typed into the site's code.
--
--   image    a picture in uploads/website
--   level    the badge — Beginner, Intermediate, Advanced or Certification
--   track    the filter — gemology, jewellery, certification or fundamentals
--   lessons  as the card prints it — "12 Lessons", "Self Paced"
--
-- Additive and nullable. Nothing existing is read, written or dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `courses`
  ADD COLUMN `image`   VARCHAR(255) NULL DEFAULT NULL AFTER `description`,
  ADD COLUMN `level`   VARCHAR(20)  NULL DEFAULT NULL AFTER `image`,
  ADD COLUMN `track`   VARCHAR(20)  NULL DEFAULT NULL AFTER `level`,
  ADD COLUMN `lessons` VARCHAR(40)  NULL DEFAULT NULL AFTER `track`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `courses`
--   DROP COLUMN `lessons`, DROP COLUMN `track`, DROP COLUMN `level`, DROP COLUMN `image`;
-- ---------------------------------------------------------------------------
