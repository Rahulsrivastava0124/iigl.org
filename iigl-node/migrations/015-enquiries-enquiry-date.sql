-- ---------------------------------------------------------------------------
-- 015 — the general enquiry book gets an enquiry date
--
-- The two books are worked by the same people on the same screen, so their
-- forms should ask the same questions. `student_enquiries` already carries an
-- `enquiry_date` a person can set; `enquiries` carried only `created_at`,
-- which is when the row was typed rather than when the enquiry came in. The
-- two differ every time somebody writes up Friday's walk-ins on Monday.
--
-- Nullable, and no backfill: a row written before this has no separate date,
-- and readers fall back to `created_at`, which is the best answer available
-- for it. Writing `created_at` into the new column would claim a fact nobody
-- recorded.
--
-- The index is for the same reason `student_enquiries` has one: a worklist is
-- read in date order, and the column is what "enquiries this week" filters on.
--
-- Additive. No existing column changes and nothing is dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `enquiries`
  ADD COLUMN `enquiry_date` date DEFAULT NULL AFTER `source`,
  ADD KEY `enquiries_enquiry_date_index` (`enquiry_date`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `enquiries`
--   DROP KEY `enquiries_enquiry_date_index`,
--   DROP COLUMN `enquiry_date`;
-- ---------------------------------------------------------------------------
