-- ---------------------------------------------------------------------------
-- 014 — the follow-up log serves both enquiry books
--
-- 013 gave `enquiries` a follow-up log. There are two enquiry books, though,
-- and they are genuinely different records:
--
--   enquiries          the general book — Ask Me, Visitor's Diary, Lead
--                      Followup, Complaints
--   student_enquiries  somebody asking about a course, which converts into a
--                      registration
--
-- Both are worked the same way: somebody calls, nobody picks up, they call
-- again on Tuesday. Two log tables would mean two of everything — endpoints,
-- components, and two chances for the history to be shown one way here and
-- another way there — so the one log takes a discriminator instead.
--
-- `enquiry_type` defaults to 'enquiry', which is what every row written by 013
-- is, so the existing rows are already correct and no backfill is needed.
--
-- The key becomes (enquiry_type, enquiry_id): an id alone no longer identifies
-- a record now that two tables supply them, and an index on the id by itself
-- would happily mix a course enquiry's history into a complaint's.
--
-- `student_enquiries` needs no new column — it already carries `follow_up_on`,
-- which is exactly what `enquiries` had to be given in 013.
--
-- Additive. Nothing is dropped and no existing row changes meaning.
-- ---------------------------------------------------------------------------

ALTER TABLE `enquiry_followups`
  ADD COLUMN `enquiry_type` varchar(20) NOT NULL DEFAULT 'enquiry' AFTER `id`;

-- The old index led on `enquiry_id`, which is no longer unique across the two
-- books. Replaced rather than added to, so there is one index for the one way
-- this table is read: the history of one record, newest first.
ALTER TABLE `enquiry_followups`
  DROP KEY `enquiry_followups_enquiry_index`,
  ADD KEY `enquiry_followups_enquiry_index` (`enquiry_type`, `enquiry_id`, `id`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `enquiry_followups`
--   DROP KEY `enquiry_followups_enquiry_index`,
--   ADD KEY `enquiry_followups_enquiry_index` (`enquiry_id`, `id`);
-- ALTER TABLE `enquiry_followups` DROP COLUMN `enquiry_type`;
-- ---------------------------------------------------------------------------
