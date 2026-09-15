-- ---------------------------------------------------------------------------
-- 065 — the website's Our Company Certificates section, written by head office
--
--   title     eg. ISO 9001:2015 Certification
--   subtitle  the line under it: who issued it, or what it covers
--   icon      award, building, gear, handshake or shield, beside the title
--   image     the certificate's picture, a path in uploads/website
--   status    1 shows it on the website, 0 keeps it in the panel only
--
-- The section stays hidden until one is active. New table; nothing existing is
-- touched.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `company_certificates` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`      VARCHAR(150) NOT NULL,
  `subtitle`   VARCHAR(150) NULL DEFAULT NULL,
  `icon`       VARCHAR(20)  NOT NULL DEFAULT 'award',
  `image`      VARCHAR(255) NOT NULL,
  `status`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP    NULL DEFAULT NULL,
  `updated_at` TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE `company_certificates`;
-- ---------------------------------------------------------------------------
