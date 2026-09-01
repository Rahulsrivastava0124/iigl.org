-- ---------------------------------------------------------------------------
-- 013 — enquiry follow-ups
--
-- An enquiry is worked, not answered once. Somebody calls, nobody picks up,
-- they call again on Tuesday, the person asks for a price, and three calls
-- later it is either a registration or a dead lead. Until now the whole of that
-- lived in `enquiries.remark`, one text column that each call overwrote — so
-- the panel could say what the last person thought and nothing about how the
-- enquiry got there, who called, or when the next attempt is due.
--
-- Two things, therefore:
--
--   enquiry_followups     one row per attempt, kept forever
--   enquiries.follow_up_on  when the next attempt is due, so the Lead Followup
--                         tab can be a worklist rather than a list
--
-- `follow_up_on` is denormalised on purpose: it is the newest follow-up's
-- `next_follow_up_on`, and a list that has to find that with a correlated
-- subquery per row is a list that gets slower as the log grows. It is written
-- by the same endpoint that writes the log row.
--
-- Additive. No existing column changes and nothing is dropped; `remark` stays
-- exactly as it is, still holding whatever it held.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `enquiry_followups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `enquiry_id` bigint unsigned NOT NULL,
  `note` text,
  -- How the attempt went. Free text in the column, a fixed list in the API:
  -- reached, no_answer, interested, not_interested, converted.
  `outcome` varchar(20) NOT NULL DEFAULT 'reached',
  -- When to try again. Null when this attempt closed the enquiry.
  `next_follow_up_on` date DEFAULT NULL,
  -- The move this attempt made, if it made one. Both null when the status was
  -- left alone, so the history distinguishes "called, no change" from "closed".
  `status_from` varchar(20) DEFAULT NULL,
  `status_to` varchar(20) DEFAULT NULL,
  -- Who made the attempt. `users.id`, not a name: people get renamed.
  `done_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  -- The history of one enquiry, newest first, is the only way this is read.
  KEY `enquiry_followups_enquiry_index` (`enquiry_id`, `id`),
  KEY `enquiry_followups_due_index` (`next_follow_up_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `enquiries`
  ADD COLUMN `follow_up_on` date DEFAULT NULL AFTER `status`,
  ADD KEY `enquiries_follow_up_on_index` (`follow_up_on`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE IF EXISTS `enquiry_followups`;
-- ALTER TABLE `enquiries` DROP KEY `enquiries_follow_up_on_index`, DROP COLUMN `follow_up_on`;
-- ---------------------------------------------------------------------------
