-- ---------------------------------------------------------------------------
-- 011 — discount coupons
--
-- A coupon is a **rule for taking money off**, held on its own and applied to
-- whoever presents it. That is a different thing from the discount already in
-- the schema:
--
--   student_courses.discount_*   money off *this* enrolment, decided for this
--                                student, recorded where the fee it reduces is
--   discount_coupons             a rule that exists before anybody uses it, is
--                                given out by its code, and can be used by many
--
-- Both stay. Migration 004 said "discount is not a stage and not a table", and
-- that is still true of the enrolment discount — a fee and its reduction must
-- not be able to disagree. A coupon is not that: it has no fee of its own until
-- somebody presents it, and what it took off which bill is a second record.
--
-- ## Who a coupon is for
--
-- Three audiences, because the panel has three kinds of customer:
--
--   laboratory   a franchise, paying head office
--   customer     somebody bringing a stone to a laboratory counter
--   student      somebody enrolling on a course
--   all          any of the three
--
-- `target_id` narrows it further to one named account when it is set — a
-- coupon written for IIGL-KOLKATTA rather than for laboratories generally.
--
-- ## What is counted
--
-- `used_count` on the coupon and one row per use in `coupon_redemptions`. The
-- count is denormalised on purpose: "has this run out" is asked on every
-- validation, and it must not cost a scan of the redemption log. The log is the
-- record — what was taken off which bill, by whom, when — and
-- `npm run check:coupons` compares the two.
--
-- Conventions follow the rest of the schema: bigint unsigned keys, varchar
-- statuses, decimal money, nullable timestamps, no foreign keys.
--
--   npm run migrate
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `discount_coupons` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,

  -- What somebody types or is told. Stored as entered and matched
  -- case-insensitively by the collation, so NEWYEAR and newyear are one coupon
  -- and cannot both be created.
  `code` varchar(40) NOT NULL,
  `title` varchar(150) DEFAULT NULL,
  `description` text,

  -- percent | fixed. Varchar rather than enum, like every other status in this
  -- schema, so adding a third kind is not a table rebuild.
  `discount_type` varchar(10) NOT NULL DEFAULT 'percent',
  `discount_value` decimal(10,2) NOT NULL DEFAULT '0.00',

  -- The cap on a percentage — "20% off, up to ₹2,000". Null is no cap, and it
  -- is meaningless on a fixed coupon.
  `max_discount` decimal(10,2) DEFAULT NULL,
  -- The bill has to reach this before the coupon applies at all.
  `min_amount` decimal(10,2) NOT NULL DEFAULT '0.00',

  -- laboratory | customer | student | all
  `audience` varchar(20) NOT NULL DEFAULT 'all',
  -- One named account, when the coupon is written for somebody in particular.
  -- A user id for a laboratory or a customer, a student id for a student.
  `target_id` bigint unsigned DEFAULT NULL,

  -- Inclusive, either end open. A coupon with neither is open until it is
  -- switched off or used up.
  `valid_from` date DEFAULT NULL,
  `valid_to` date DEFAULT NULL,

  -- Null is unlimited for both.
  `usage_limit` int unsigned DEFAULT NULL,
  `per_user_limit` int unsigned DEFAULT NULL,
  `used_count` int unsigned NOT NULL DEFAULT '0',

  `is_active` tinyint(1) NOT NULL DEFAULT '1',

  -- Whose coupon it is. NULL is head office's, offered wherever its audience
  -- reaches; a laboratory's own is theirs to write and theirs alone to spend.
  `owner_id` bigint unsigned DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,

  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `discount_coupons_code_unique` (`code`),
  KEY `discount_coupons_audience_index` (`audience`),
  KEY `discount_coupons_owner_id_index` (`owner_id`),
  KEY `discount_coupons_is_active_index` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `coupon_redemptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `coupon_id` bigint unsigned NOT NULL,
  -- The code as it stood when it was used. A coupon can be renamed; a receipt
  -- cannot, so the row keeps the name it was spent under.
  `code` varchar(40) NOT NULL,

  `audience` varchar(20) NOT NULL,
  -- Who it was spent on: a user id for a laboratory or customer, a student id
  -- for a student. Null when the bill belongs to nobody on file.
  `subject_id` bigint unsigned DEFAULT NULL,

  `amount_before` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `amount_after` decimal(12,2) NOT NULL DEFAULT '0.00',

  -- What the discount was taken off, when there is a record for it — an order,
  -- an enrolment. Kept as a name and an id rather than a column per kind.
  `subject_type` varchar(30) DEFAULT NULL,
  `reference_id` bigint unsigned DEFAULT NULL,

  `redeemed_by` bigint unsigned DEFAULT NULL,
  `lab_id` bigint unsigned DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,

  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `coupon_redemptions_coupon_id_index` (`coupon_id`),
  KEY `coupon_redemptions_subject_index` (`audience`, `subject_id`),
  KEY `coupon_redemptions_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
