-- ---------------------------------------------------------------------------
-- 003 — students and enquiries
--
-- These two are **new features, not a port.** The Laravel admin sidebar shows a
-- Student menu (Enquiry, Enrollment, Active Student, Alumni, Fee Collection)
-- and an Enquiry menu (Enquiry from Ask Me, Visitor's Diary, Lead followup,
-- Complain), but every one of those entries is `href="#"`: no route, no
-- controller, no table, no view. Nothing was ever stored, so there is nothing
-- to migrate and no old behaviour to match.
--
-- The shape below is therefore a decision rather than a recovery, and it is
-- kept deliberately small: one table per menu, a `status` column instead of a
-- table per lifecycle stage, and a `kind` column instead of four enquiry
-- tables. The old sidebar's five student entries are five filters over one
-- table — a student who enrols is the same person who enquired, and splitting
-- them apart would mean copying rows between tables as their status changed.
--
-- Conventions follow the rest of this schema rather than good practice: bigint
-- unsigned keys, varchar statuses, nullable timestamps, and **no foreign
-- keys** — the database has none anywhere, and adding them on two tables only
-- would make the schema inconsistent without making it safe.
--
-- Additive: creates two tables, touches nothing that exists. The rollback is at
-- the bottom.
--
--   mysql -u root -p iigl < migrations/003-students-enquiries.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `students` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `course` varchar(120) DEFAULT NULL,

  -- The lifecycle, as the old menu named it: an enquiry becomes an enrolment,
  -- an enrolment becomes an active student, and a finished student is an
  -- alumnus. One row moves through all four.
  `status` varchar(20) NOT NULL DEFAULT 'enquiry',

  -- Which laboratory teaches them. Nullable because a head-office enquiry has
  -- not been placed with a branch yet.
  `lab_id` bigint unsigned DEFAULT NULL,

  `enrolled_on` date DEFAULT NULL,
  `completed_on` date DEFAULT NULL,

  -- Fee collection. `fee_paid` is a running total rather than a ledger: there
  -- is no receipt table behind it, and inventing one before anybody has taken
  -- a payment through this screen would be building the wrong thing twice.
  `fee_total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fee_paid` decimal(10,2) NOT NULL DEFAULT 0.00,

  `remark` text,
  `added_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `students_status_index` (`status`),
  KEY `students_mobile_index` (`mobile`),
  KEY `students_lab_id_index` (`lab_id`),
  KEY `students_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `enquiries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,

  -- The old Enquiry menu's four entries, as one column: ask, visit, lead,
  -- complaint. Four tables would have carried the same columns four times.
  `kind` varchar(20) NOT NULL DEFAULT 'ask',

  `name` varchar(150) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `subject` varchar(200) DEFAULT NULL,
  `message` text,

  -- Where it came from: website, phone, walk-in.
  `source` varchar(50) DEFAULT NULL,

  -- new -> open (somebody is on it) -> closed.
  `status` varchar(20) NOT NULL DEFAULT 'new',

  `assigned_to` bigint unsigned DEFAULT NULL,
  `lab_id` bigint unsigned DEFAULT NULL,
  `remark` text,
  `closed_at` timestamp NULL DEFAULT NULL,
  `added_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `enquiries_kind_index` (`kind`),
  KEY `enquiries_status_index` (`status`),
  KEY `enquiries_mobile_index` (`mobile`),
  KEY `enquiries_assigned_to_index` (`assigned_to`),
  KEY `enquiries_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- Both tables are new, so dropping them returns the database to exactly its
-- previous state. Anything entered through the panel is lost with them.
--
--   DROP TABLE IF EXISTS `enquiries`;
--   DROP TABLE IF EXISTS `students`;
-- ---------------------------------------------------------------------------
