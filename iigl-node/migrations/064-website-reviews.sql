-- ---------------------------------------------------------------------------
-- 064 — the website's Our Reviews section, written by head office
--
--   name     who said it
--   trade    their line of work, under the name
--   quote    what they said
--   rating   stars, 1 to 5
--   status   1 shows it on the website, 0 keeps it in the panel only
--
-- Until a review is active the website shows its built-in four. New table;
-- nothing existing is touched.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `reviews` (
  `id`         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100)     NOT NULL,
  `trade`      VARCHAR(100)     NULL DEFAULT NULL,
  `quote`      TEXT             NOT NULL,
  `rating`     TINYINT UNSIGNED NOT NULL DEFAULT 5,
  `status`     TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP        NULL DEFAULT NULL,
  `updated_at` TIMESTAMP        NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE `reviews`;
-- ---------------------------------------------------------------------------
