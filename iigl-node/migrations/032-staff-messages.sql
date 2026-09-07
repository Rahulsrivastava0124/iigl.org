-- ---------------------------------------------------------------------------
-- 032 — messages and requests from staff to their employer
--
-- The Laravel sidebars carry a Message menu with Send Message and Message
-- History. Both entries are `href="#"`: no route, no controller, no table. The
-- feature was drawn and never built, and FEATURE-GAP.md records it as nothing
-- to migrate.
--
-- This builds it, and only as far as it is actually needed: an employee writes
-- to the person who employs them, and that person reads it beside the
-- attendance it is usually about. Not a mail system — no threads, no replies,
-- no attachments. A line of text, who wrote it, and whether it has been dealt
-- with.
--
--   kind = 'message'   something to tell them
--   kind = 'request'   something to be done — a correction, a day off
--
-- `about_date` is the day it concerns, when it concerns one. A request to fix a
-- missed punch-out is about a date, and the employer reading it wants to open
-- that day rather than search for it.
--
-- `resolved_at` is the whole of the state: unread and open are the same thing
-- to the person who has to act, and a second column would be one more thing to
-- keep in step with the first.
--
-- New table. Nothing existing is touched.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `staff_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- Who wrote it, and who it is for. Both are `users.id`: the employer is a
  -- laboratory or head office, and both are user rows here.
  `from_user` bigint unsigned NOT NULL,
  `to_user` bigint unsigned NOT NULL,
  `kind` varchar(20) NOT NULL DEFAULT 'message',
  `body` text NOT NULL,
  -- The day it is about, where it is about one.
  `about_date` date DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `resolved_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  -- The two ways this is read: my inbox, newest first, and one employee's
  -- messages on their own page.
  KEY `staff_messages_inbox_index` (`to_user`, `id`),
  KEY `staff_messages_sender_index` (`from_user`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE IF EXISTS `staff_messages`;
-- ---------------------------------------------------------------------------
