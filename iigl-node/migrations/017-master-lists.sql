-- ---------------------------------------------------------------------------
-- 017 — the master lists
--
-- Five lists the panel has been carrying in code or not at all:
--
--   gst_rates       the GST percentages a course fee or a price is quoted at
--   enquiry_types   the kinds an enquiry can be, which lived in a TypeScript
--                   const and so could only be changed by a deploy
--   countries       \
--   states          |  the address hierarchy, three levels, each row naming
--   districts       /  its parent
--
-- Every one of them is the same shape on purpose — a name, whether it is in
-- use, and when it changed — because they are the same kind of thing: a short
-- list somebody in head office maintains and every form reads.
--
-- **`is_active`, never a delete.** A district removed from the list is still
-- the district on four hundred old addresses. Deactivating keeps those rows
-- readable and stops the district being offered on new ones; deleting would
-- leave the old rows pointing at nothing. The API deletes only a row nothing
-- references yet.
--
-- No foreign keys, matching the rest of this schema — the Laravel application
-- declares none and this service never enforces at the database what it has to
-- enforce in the router anyway. The indexes are what the joins need.
--
-- `enquiry_types` is seeded with the five kinds already in use, `code` holding
-- exactly the strings `enquiries.kind` already contains, so every existing row
-- keeps its meaning and nothing needs rewriting.
--
-- `courses.gst_id` and `prices.gst_id` are nullable: a course or a price
-- written before this quotes no rate of its own, and the 18% in `money.ts`
-- still answers for it. Nothing about existing pricing changes.
--
-- Additive throughout. No existing column changes and nothing is dropped.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `gst_rates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  -- 18.00, not 0.18: the panel shows a percentage and so does the invoice.
  `percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `gst_rates_active_index` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `enquiry_types` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- What `enquiries.kind` holds. Immutable once rows point at it: renaming a
  -- code orphans every enquiry filed under the old one, so the API refuses.
  `code` varchar(30) NOT NULL,
  `label` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  -- The order the tabs appear in. Ties fall back to the label.
  `sort` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `enquiry_types_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `enquiry_types` (`code`, `label`, `sort`, `created_at`, `updated_at`) VALUES
  ('ask',        'Ask me',           1, NOW(), NOW()),
  ('visit',      "Visitor's diary",  2, NOW(), NOW()),
  ('lead',       'Lead followup',    3, NOW(), NOW()),
  ('complaint',  'Complaints',       4, NOW(), NOW()),
  ('laboratory', 'Laboratory',       5, NOW(), NOW())
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

CREATE TABLE IF NOT EXISTS `countries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  -- ISO two-letter, where somebody knows it. Not required: the list is for
  -- addresses, and an address does not stop being one without a code.
  `code` varchar(5) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `countries_active_index` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `states` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `country_id` bigint unsigned NOT NULL,
  `name` varchar(100) NOT NULL,
  `code` varchar(10) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  -- The only way this is read: the states of one country, by name.
  KEY `states_country_index` (`country_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `districts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `state_id` bigint unsigned NOT NULL,
  `name` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `districts_state_index` (`state_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `courses`
  ADD COLUMN `gst_id` bigint unsigned DEFAULT NULL AFTER `fee`,
  ADD KEY `courses_gst_index` (`gst_id`);

ALTER TABLE `prices`
  ADD COLUMN `gst_id` bigint unsigned DEFAULT NULL,
  ADD KEY `prices_gst_index` (`gst_id`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `prices`  DROP KEY `prices_gst_index`,  DROP COLUMN `gst_id`;
-- ALTER TABLE `courses` DROP KEY `courses_gst_index`, DROP COLUMN `gst_id`;
-- DROP TABLE IF EXISTS `districts`;
-- DROP TABLE IF EXISTS `states`;
-- DROP TABLE IF EXISTS `countries`;
-- DROP TABLE IF EXISTS `enquiry_types`;
-- DROP TABLE IF EXISTS `gst_rates`;
-- ---------------------------------------------------------------------------
