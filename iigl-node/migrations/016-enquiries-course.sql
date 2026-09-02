-- ---------------------------------------------------------------------------
-- 016 — the general enquiry book records a course
--
-- `student_enquiries` carries the pair `course_id` / `course_interested`: the
-- course somebody asked about when we run it, and what they called it when we
-- do not. The general book had neither, so an enquiry that named a course had
-- nowhere to put it and it ended up inside the subject line, where nothing can
-- count or filter it.
--
-- The pair, not one column, for the same reason the student table has both: a
-- foreign key answers "how many asked about Diamond Grading" and free text
-- answers "what are people asking for that we do not teach". Squashing them
-- into one loses whichever question you did not ask first.
--
-- No foreign key, matching the rest of this schema — the Laravel application
-- declares none, and adding one here would fail on rows it does not police.
-- The index is what a join actually needs.
--
-- Both nullable, no backfill: an enquiry recorded before this named no course
-- in a place anything could read, and inventing one from the subject line
-- would be a guess written into the data.
--
-- Additive. No existing column changes and nothing is dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `enquiries`
  ADD COLUMN `course_id` bigint unsigned DEFAULT NULL AFTER `subject`,
  ADD COLUMN `course_interested` varchar(191) DEFAULT NULL AFTER `course_id`,
  ADD KEY `enquiries_course_id_index` (`course_id`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `enquiries`
--   DROP KEY `enquiries_course_id_index`,
--   DROP COLUMN `course_interested`,
--   DROP COLUMN `course_id`;
-- ---------------------------------------------------------------------------
