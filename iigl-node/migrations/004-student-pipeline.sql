-- ---------------------------------------------------------------------------
-- 004 — the student pipeline
--
-- Replaces the single `students` table from migration 003 with the five stages
-- the pipeline actually has:
--
--     enquiry --convert--> registration --enrol--> course --> certificate
--                                          `-- discount applies here
--
-- 003 modelled a student as one row with a status of enquiry/enrolled/active/
-- alumni. That collapses three different records into one: an enquiry has a
-- course somebody is *interested* in and a follow-up trail, a registration has
-- documents and a registration number, and an enrolment has a batch, dates and
-- a fee. Carrying all of them in one row means most columns are null most of
-- the time, and it cannot hold a student who takes a second course.
--
-- `students` is dropped and recreated rather than altered. It was created in
-- this same session, holds **zero rows**, and has never been written to by
-- anything but a verification insert that was removed — so nothing is lost.
-- `enquiries` from 003 is untouched: that is the general enquiry book (Ask Me,
-- Visitor's Diary, Lead followup, Complain) behind its own menu, and a course
-- enquiry is a different record with a different lifecycle.
--
-- **Discount is not a stage.** It is three columns on the enrolment that hold
-- the money, exactly where the fee it reduces lives:
--
--     Course fee   30,000
--     Discount      5,000
--     -------------------
--     Final fee    25,000
--
-- A discount table of its own would let a fee and its discount disagree, and
-- would need a join to answer "what does this student owe".
--
-- Conventions follow the rest of the schema: bigint unsigned keys, varchar
-- statuses, nullable timestamps, no foreign keys.
--
--   mysql -u root -p iigl < migrations/004-student-pipeline.sql
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS `students`;

-- ------------------------------------------------------------------ 1. enquiry
CREATE TABLE IF NOT EXISTS `student_enquiries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `email` varchar(150) DEFAULT NULL,

  -- What they asked about. A course id when it is one we run, and the free
  -- text beside it because an enquiry often names a course we do not offer yet.
  `course_id` bigint unsigned DEFAULT NULL,
  `course_interested` varchar(150) DEFAULT NULL,

  `enquiry_date` date DEFAULT NULL,
  `source` varchar(50) DEFAULT NULL,

  -- new -> contacted -> interested -> converted, or not_interested at any point.
  `status` varchar(20) NOT NULL DEFAULT 'new',

  `remarks` text,
  `follow_up_on` date DEFAULT NULL,

  -- Set when the enquiry becomes a registration, so the trail runs both ways
  -- and the same enquiry cannot be converted twice.
  `student_id` bigint unsigned DEFAULT NULL,
  `converted_at` timestamp NULL DEFAULT NULL,

  `lab_id` bigint unsigned DEFAULT NULL,
  `added_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `student_enquiries_status_index` (`status`),
  KEY `student_enquiries_mobile_index` (`mobile`),
  KEY `student_enquiries_student_id_index` (`student_id`),
  KEY `student_enquiries_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------- 2. registration
CREATE TABLE IF NOT EXISTS `students` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,

  -- The number written on the paperwork: IIGL-2026-0001. Unique, because it is
  -- how a student is referred to by everyone who is not looking at a database.
  `registration_no` varchar(30) NOT NULL,

  -- Personal details
  `name` varchar(150) NOT NULL,
  `father_name` varchar(150) DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,

  -- Contact details
  `mobile` varchar(20) NOT NULL,
  `alt_mobile` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `pincode` varchar(12) DEFAULT NULL,

  -- Documents. Paths into the same public/uploads tree the rest of the
  -- application writes to, not blobs.
  `photo` varchar(255) DEFAULT NULL,
  `id_proof` varchar(255) DEFAULT NULL,
  `qualification_doc` varchar(255) DEFAULT NULL,

  `registration_date` date DEFAULT NULL,

  -- The course they registered for. The enrolment in `student_courses` is what
  -- carries the batch and the money; this is what they signed up to.
  `course_id` bigint unsigned DEFAULT NULL,

  -- pending -> registered -> active
  `status` varchar(20) NOT NULL DEFAULT 'pending',

  `enquiry_id` bigint unsigned DEFAULT NULL,
  `remark` text,
  `lab_id` bigint unsigned DEFAULT NULL,
  `added_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `students_registration_no_unique` (`registration_no`),
  KEY `students_status_index` (`status`),
  KEY `students_mobile_index` (`mobile`),
  KEY `students_course_id_index` (`course_id`),
  KEY `students_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------- 3a. course catalogue
CREATE TABLE IF NOT EXISTS `courses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `code` varchar(30) DEFAULT NULL,

  -- Free text — "6 months", "12 weeks" — because that is how a prospectus
  -- states it, and a number of days would have to be translated back for
  -- every screen that shows it.
  `duration` varchar(60) DEFAULT NULL,

  `fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `description` text,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `added_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `courses_is_active_index` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------ 3b. the enrolment
--
-- One student on one course in one batch. This is where the money lives.
CREATE TABLE IF NOT EXISTS `student_courses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `student_id` bigint unsigned NOT NULL,
  `course_id` bigint unsigned NOT NULL,

  `batch` varchar(60) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,

  -- Copied from the course when the enrolment is made, not read through it: a
  -- fee change next year must not rewrite what somebody was billed last year.
  `fee` decimal(10,2) NOT NULL DEFAULT 0.00,

  -- The discount, on the row that holds the fee it reduces.
  `discount_type` varchar(10) DEFAULT NULL,
  `discount_value` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_reason` varchar(255) DEFAULT NULL,
  `discount_approved_by` bigint unsigned DEFAULT NULL,
  `discount_applied_on` date DEFAULT NULL,

  -- fee - discount_amount, stored rather than derived: it is what the student
  -- agreed to pay, and a later change to the discount rules must not silently
  -- restate an agreed figure.
  `final_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fee_paid` decimal(10,2) NOT NULL DEFAULT 0.00,

  -- upcoming -> ongoing -> completed
  `status` varchar(20) NOT NULL DEFAULT 'upcoming',
  `completed_on` date DEFAULT NULL,
  `result` varchar(30) DEFAULT NULL,

  `remark` text,
  `added_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `student_courses_student_id_index` (`student_id`),
  KEY `student_courses_course_id_index` (`course_id`),
  KEY `student_courses_status_index` (`status`),
  KEY `student_courses_batch_index` (`batch`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------- 4. certificate
--
-- Issued against a completed enrolment, not against a student: somebody who
-- takes two courses earns two certificates.
CREATE TABLE IF NOT EXISTS `student_certificates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `student_course_id` bigint unsigned NOT NULL,
  `student_id` bigint unsigned NOT NULL,

  -- Its own series, deliberately unlike a gemstone certificate number: these
  -- are read side by side and must not be mistaken for one another.
  `certificate_no` varchar(30) NOT NULL,

  `issued_on` date DEFAULT NULL,
  `grade` varchar(20) DEFAULT NULL,
  `remark` text,
  `file` varchar(255) DEFAULT NULL,
  `issued_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_certificates_no_unique` (`certificate_no`),
  KEY `student_certificates_student_id_index` (`student_id`),
  KEY `student_certificates_course_index` (`student_course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- All five tables are new. Dropping them returns the database to its state
-- before migration 003, and loses anything entered through the panel.
--
--   DROP TABLE IF EXISTS `student_certificates`;
--   DROP TABLE IF EXISTS `student_courses`;
--   DROP TABLE IF EXISTS `courses`;
--   DROP TABLE IF EXISTS `students`;
--   DROP TABLE IF EXISTS `student_enquiries`;
-- ---------------------------------------------------------------------------
