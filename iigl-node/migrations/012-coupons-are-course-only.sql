-- ---------------------------------------------------------------------------
-- 012 — a coupon is a course discount, and nothing else
--
-- Migration 011 built coupons with an `audience` — laboratory, customer or
-- student — on the reading that a code could come off any bill in the system.
-- It cannot: a coupon here is money off a **course enrolment**, taken against
-- the fee on `student_courses`, and there is nowhere else for one to land. An
-- audience column with two values nothing can use is not flexibility, it is a
-- question every screen has to ask and no answer ever changes.
--
-- So the shape narrows:
--
--   audience, target_id   gone. Every coupon is for a student enrolling.
--   owner_id              gone. The student pipeline is head office's — course
--                         routes are all `requireAdmin` — so there is no second
--                         owner for a coupon to belong to.
--   course_id             new, nullable. A coupon for one course, or null for
--                         any course we run.
--   per_user_limit        renamed per_student_limit, which is who it counts.
--
-- `coupon_redemptions` loses the same generality: a redemption is one student,
-- one enrolment, so it names them rather than carrying a subject_type and an
-- id that could mean anything.
--
-- **Both tables are dropped and recreated.** They hold zero rows — 011 ran
-- today and nothing has been written through it — so there is nothing to
-- migrate and an ALTER that keeps empty columns alive would only leave the old
-- question in the schema. Needs `--allow-drop`.
--
--   npm run migrate -- --allow-drop
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS `coupon_redemptions`;
DROP TABLE IF EXISTS `discount_coupons`;

CREATE TABLE `discount_coupons` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,

  -- What a student is told, and types back. Stored as entered and matched
  -- case-insensitively by the collation, so NEWYEAR and newyear are one coupon.
  `code` varchar(40) NOT NULL,
  `title` varchar(150) DEFAULT NULL,
  `description` text,

  -- percent | fixed. Varchar like every other status in this schema.
  `discount_type` varchar(10) NOT NULL DEFAULT 'percent',
  `discount_value` decimal(10,2) NOT NULL DEFAULT '0.00',

  -- The cap on a percentage — "20% off, up to ₹5,000". Null is no cap, and it
  -- means nothing on a fixed coupon.
  `max_discount` decimal(10,2) DEFAULT NULL,
  -- The course fee has to reach this before the coupon applies at all.
  `min_amount` decimal(10,2) NOT NULL DEFAULT '0.00',

  -- One course, or null for any of them.
  `course_id` bigint unsigned DEFAULT NULL,

  -- Inclusive, either end open.
  `valid_from` date DEFAULT NULL,
  `valid_to` date DEFAULT NULL,

  -- Null is unlimited for both. The second counts one student's enrolments.
  `usage_limit` int unsigned DEFAULT NULL,
  `per_student_limit` int unsigned DEFAULT NULL,
  `used_count` int unsigned NOT NULL DEFAULT '0',

  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` bigint unsigned DEFAULT NULL,

  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `discount_coupons_code_unique` (`code`),
  KEY `discount_coupons_course_id_index` (`course_id`),
  KEY `discount_coupons_is_active_index` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `coupon_redemptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `coupon_id` bigint unsigned NOT NULL,
  -- The code as it stood when it was used. A coupon can be renamed; what a
  -- student was charged cannot.
  `code` varchar(40) NOT NULL,

  -- The enrolment the discount landed on, and the student holding it. Both,
  -- because a per-student limit counts students and a receipt names enrolments.
  `enrolment_id` bigint unsigned NOT NULL,
  `student_id` bigint unsigned DEFAULT NULL,
  `course_id` bigint unsigned DEFAULT NULL,

  `fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `final_fee` decimal(12,2) NOT NULL DEFAULT '0.00',

  `redeemed_by` bigint unsigned DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,

  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `coupon_redemptions_coupon_id_index` (`coupon_id`),
  KEY `coupon_redemptions_enrolment_id_index` (`enrolment_id`),
  KEY `coupon_redemptions_student_id_index` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
