-- ---------------------------------------------------------------------------
-- 021 — GST on the enrolments that already existed
--
-- 020 added `gst_percent` / `gst_amount` to `student_courses` and left every
-- existing row at zero, so nothing anybody had already been quoted moved. That
-- was the cautious half of the change. This is the other half, asked for
-- deliberately: the enrolments written before 020 take the rate their course
-- names today.
--
-- **This changes what people owe.** An enrolment of 14,850 on a course quoted
-- at 18% becomes 17,523 payable, and its due goes up by the tax. Anybody
-- already told a figure was told the old one. That is the point of it being a
-- migration with a rollback rather than a quiet update: it is a decision with
-- a date on it.
--
-- Only rows that have no tax yet and whose course names a rate are touched:
--
--   * `gst_amount = 0` — an enrolment created since 020 already carries its
--     own snapshot, and recomputing it would overwrite a rate that was true
--     when it was quoted with one that is true now;
--   * the course names a rate, from the master list or typed on itself — the
--     same resolution the API uses;
--   * `final_fee > 0` — a scholarship place stays a scholarship place.
--
-- The tax is worked out on `final_fee`, the fee after any discount, which is
-- what the API does when a discount is applied.
--
-- Nothing paid is touched. A student who has paid in full against the old
-- figure now shows the tax as outstanding, which is the honest reading: the
-- tax was not collected.
-- ---------------------------------------------------------------------------

UPDATE `student_courses` `sc`
  JOIN `courses` `c` ON `c`.`id` = `sc`.`course_id`
  LEFT JOIN `gst_rates` `g` ON `g`.`id` = `c`.`gst_id`
SET
  `sc`.`gst_percent` = COALESCE(`g`.`percent`, `c`.`gst_percent`),
  `sc`.`gst_amount`  = ROUND(`sc`.`final_fee` * COALESCE(`g`.`percent`, `c`.`gst_percent`) / 100, 2),
  `sc`.`updated_at`  = NOW()
WHERE `sc`.`gst_amount` = 0
  AND `sc`.`final_fee` > 0
  AND COALESCE(`g`.`percent`, `c`.`gst_percent`) > 0;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- Puts every enrolment back to no tax. Safe only while 020 is the newest
-- change to these two columns: it clears the snapshots on enrolments made
-- since, as well as the ones this migration wrote.
--
-- UPDATE `student_courses` SET `gst_percent` = 0, `gst_amount` = 0;
-- ---------------------------------------------------------------------------
