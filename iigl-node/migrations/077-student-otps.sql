-- ---------------------------------------------------------------------------
-- 077 — one-time codes for the student website login
--
-- A student signs in to their own portal on the public site with a code sent
-- to them, rather than a password (the students table has none). One row per
-- student, replaced each time a code is asked for: the latest code, its hash,
-- when it expires and how many times it has been tried.
--
-- The code is stored hashed, like a password — a leak of this table must not
-- hand somebody a live login — and the row is keyed unique by student so a new
-- request overwrites the last rather than leaving old codes valid.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `student_otps` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `code_hash`  VARCHAR(255)    NOT NULL,
  `expires_at` DATETIME        NOT NULL,
  `attempts`   INT             NOT NULL DEFAULT 0,
  `created_at` DATETIME        NOT NULL,
  `updated_at` DATETIME        NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_otps_student_unique` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
