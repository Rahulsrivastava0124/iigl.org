-- ---------------------------------------------------------------------------
-- 019 — a GST percent typed on the row itself
--
-- 017 gave courses and price bands a `gst_id` pointing at the GST master list.
-- The list is the right home for the rates used over and over, but it is not
-- the only case: a one-off band quoted at a rate nobody will use again should
-- not have to become a row in a list every form then offers forever.
--
-- So each of the two carries an alternative: a percent written on the row.
--
--   gst_id       chosen from the master list  — the usual case
--   gst_percent  typed here, for this row only
--
-- **One or the other, never both.** The API clears whichever was not chosen,
-- so there is no pair that can disagree and no reader that has to decide which
-- of two answers is the real one. Both null means the row states no rate,
-- which is what every row written before 017 says.
--
-- Both nullable, no backfill. Order pricing is untouched either way: what an
-- order is billed is still the ported 18% in money.ts, and these two columns
-- record what a fee or a band is quoted at.
--
-- Additive. No existing column changes and nothing is dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `courses`
  ADD COLUMN `gst_percent` decimal(5,2) DEFAULT NULL AFTER `gst_id`;

ALTER TABLE `prices`
  ADD COLUMN `gst_percent` decimal(5,2) DEFAULT NULL AFTER `gst_id`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `prices`  DROP COLUMN `gst_percent`;
-- ALTER TABLE `courses` DROP COLUMN `gst_percent`;
-- ---------------------------------------------------------------------------
