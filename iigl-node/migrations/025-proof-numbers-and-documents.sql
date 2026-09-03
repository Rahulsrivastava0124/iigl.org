-- ---------------------------------------------------------------------------
-- 025 — the number on the proof, and the rest of the file
--
-- Two things the franchisee form implies and the schema could not hold.
--
-- **The proof numbers.** ID PROOF offers PAN, AADHAR or PASSPORT and ADDRESS
-- PROOF offers AADHAR, D.L.NO. or VOTER ID. Two of those six had a column —
-- `pan_no` and `adhar_no` — so somebody who produced a passport or a driving
-- licence had the box ticked and the number written nowhere. Three columns
-- close that, and PAN and Aadhaar keep the columns they already have: they are
-- read by the profile screens and printed on other documents, and a second
-- home for the same number is a second answer to the same question.
--
-- **The documents themselves.** `documentation` holds one path, so a
-- laboratory that sends a rent agreement, a shop licence and a cancelled
-- cheque could keep one of the three. `documents` holds the set, as JSON:
--
--   [{"title": "Rent agreement", "path": "public/uploads/documentation/x.pdf",
--     "added_at": "2026-09-03T10:04:11.000Z"}]
--
-- JSON rather than a table because these are attachments to one account and
-- are only ever read with it: nothing joins them, nothing counts them, and no
-- screen lists documents across laboratories. A table would be a join and a
-- migration for a list that is read in one place.
--
-- `documentation` is left exactly as it is. It is written by the existing
-- field, printed where it is printed, and moving it would rewrite live paths
-- for no gain — the new column is additional, not a replacement.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `passport_no` VARCHAR(30) NULL DEFAULT NULL AFTER `pan_no`,
  ADD COLUMN `dl_no`       VARCHAR(30) NULL DEFAULT NULL AFTER `passport_no`,
  ADD COLUMN `voter_id`    VARCHAR(30) NULL DEFAULT NULL AFTER `dl_no`,
  ADD COLUMN `documents`   JSON        NULL DEFAULT NULL AFTER `documentation`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users`
--   DROP COLUMN `passport_no`,
--   DROP COLUMN `dl_no`,
--   DROP COLUMN `voter_id`,
--   DROP COLUMN `documents`;
--
-- Dropping `documents` destroys the attachment list. Read it out first.
-- ---------------------------------------------------------------------------
