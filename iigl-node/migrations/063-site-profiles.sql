-- ---------------------------------------------------------------------------
-- 063 — a website page's own settings: head office's, and each branch's
--
-- The website lists laboratories as branches, and each now has a page of its
-- own; head office has the same set for the main site. One row per page:
--
--   lab_id     the laboratory's users.id, or 0 for head office
--   banner     the wide picture at the top, a path in uploads/banner
--   content    formatted text, HTML from the panel's editor
--   gallery    JSON array of picture paths in uploads/banner
--   whatsapp   digits with country code, as wa.me takes them
--   facebook   page link
--   instagram  profile link
--
-- A laboratory edits its own row from its panel; head office edits its own and
-- any laboratory's. New table; nothing existing is touched.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `site_profiles` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lab_id`     INT UNSIGNED NOT NULL,
  `banner`     VARCHAR(255) NULL DEFAULT NULL,
  `content`    MEDIUMTEXT   NULL,
  `gallery`    JSON         NULL,
  `whatsapp`   VARCHAR(20)  NULL DEFAULT NULL,
  `facebook`   VARCHAR(255) NULL DEFAULT NULL,
  `instagram`  VARCHAR(255) NULL DEFAULT NULL,
  `updated_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP    NULL DEFAULT NULL,
  `updated_at` TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `site_profiles_lab_id_unique` (`lab_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE `site_profiles`;
-- ---------------------------------------------------------------------------
