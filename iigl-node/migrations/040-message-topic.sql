-- ---------------------------------------------------------------------------
-- 040 — what a request is about
--
-- `staff_messages.kind` says 'message' or 'request'. Both of the things anybody
-- actually requests — leave on a day, a punch to correct on a day — are
-- 'request', name a day in `about_date`, and differ only in the sentence
-- somebody typed, which they are free to rewrite.
--
-- So nothing can answer "is this person on leave today". The Employee list
-- wants to say Present, Not punched or Leave, and the third of those is not a
-- state the database can express: a leave request and a punch-error request are
-- the same row with different prose.
--
-- One column, holding the template the request was written from — 'leave',
-- 'punch', or NULL for anything typed from scratch. Set alongside `kind` by the
-- same picker that already chooses between them, so nobody has to answer a new
-- question.
--
-- NULL on every existing row, which is correct: those were written before there
-- was anything to record, and guessing from their wording would put people on
-- leave who never asked for it.
--
-- Additive and nullable. Nothing existing is read, written or dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `staff_messages`
  ADD COLUMN `topic` VARCHAR(20) NULL DEFAULT NULL AFTER `kind`;

-- The Employee list asks "any leave naming today, for these people" on every
-- load. Without this it is a scan of every message ever written.
CREATE INDEX `staff_messages_topic_date` ON `staff_messages` (`topic`, `about_date`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP INDEX `staff_messages_topic_date` ON `staff_messages`;
-- ALTER TABLE `staff_messages` DROP COLUMN `topic`;
--
-- Nothing else holds this. The Employee list falls back to Present or Not
-- punched, which is what it showed before.
-- ---------------------------------------------------------------------------
