-- ---------------------------------------------------------------------------
-- 066 — the website's Education page: student testimonials and a course gallery
--
-- reviews.kind   whose words: client (the home page's Our Reviews, every row
--                so far) or student (the Education page's testimonials)
--
-- education_gallery, one picture per row:
--   title    optional caption
--   image    a path in uploads/website
--   status   1 shows it on the website, 0 keeps it in the panel only
--
-- One column added with a default, one new table; no existing value changes.
-- ---------------------------------------------------------------------------

ALTER TABLE `reviews` ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'client' AFTER `id`;

CREATE TABLE IF NOT EXISTS `education_gallery` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`      VARCHAR(150) NULL DEFAULT NULL,
  `image`      VARCHAR(255) NOT NULL,
  `status`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP    NULL DEFAULT NULL,
  `updated_at` TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `reviews` DROP COLUMN `kind`;
-- DROP TABLE `education_gallery`;
-- ---------------------------------------------------------------------------
