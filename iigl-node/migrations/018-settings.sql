-- ---------------------------------------------------------------------------
-- 018 — settings
--
-- The things that were constants in TypeScript or lines in `.env`, and that
-- somebody in head office should be able to change without a deploy: the
-- company's own details, the GST rate, the certificate prefix, where the panel
-- lives and who mail comes from.
--
-- One key/value table rather than a column per setting. These are read as a
-- bag, written one at a time from a form, and a new one arrives every few
-- months; a column each would be a migration every time somebody wants a line
-- on an invoice changed.
--
-- **Empty means "the built-in default".** No row is seeded. Every reader falls
-- back to the constant or the environment variable it used before, so applying
-- this migration changes nothing at all — pricing, numbering and mail behave
-- exactly as they did until somebody deliberately saves a value. That is what
-- makes this safe to apply to a database mid-flight, and it is why `value` is
-- nullable rather than defaulting to a string.
--
-- `updated_by` is `users.id`. Who changed the GST rate is the first question
-- anybody asks when an invoice comes out wrong.
--
-- Additive. Nothing else changes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `settings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- `company.name`, `pricing.gst_percent`. Grouped by the part before the dot,
  -- which is also how the screen tabs them.
  `key` varchar(100) NOT NULL,
  `value` text,
  `updated_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `settings_key_unique` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE IF EXISTS `settings`;
-- ---------------------------------------------------------------------------
