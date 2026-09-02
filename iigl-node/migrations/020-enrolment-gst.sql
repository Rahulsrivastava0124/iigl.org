-- ---------------------------------------------------------------------------
-- 020 — GST on an enrolment
--
-- A course fee is quoted at a GST rate (017, 019). Until now that rate was
-- recorded against the course and nothing else: what a student was actually
-- asked for — `student_courses.final_fee` — had no tax on it, and the fee
-- statement could not show a GST line because there was no figure to show.
--
-- Two columns on the enrolment:
--
--   gst_percent  the rate as it stood when the enrolment was made
--   gst_amount   the money that rate came to, on the fee after discount
--
-- **Snapshotted, not looked up.** A rate is a master row somebody can edit or
-- retire, and a fee already quoted must not move because the list changed
-- afterwards. This is the same reason `student_courses` already copies the
-- fee off the course rather than joining to it, and the same reason a coupon
-- redemption keeps the code as it stood at the time.
--
-- **Both default to zero, and nothing is backfilled.** Every enrolment written
-- before this was quoted with no tax on it, and applying a rate to it now
-- would change what somebody has already been told they owe. Payable is
-- `final_fee + gst_amount`, so an untouched row is payable exactly as before.
--
-- Additive. No existing column changes and nothing is dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `student_courses`
  ADD COLUMN `gst_percent` decimal(5,2) NOT NULL DEFAULT '0.00' AFTER `final_fee`,
  ADD COLUMN `gst_amount` decimal(12,2) NOT NULL DEFAULT '0.00' AFTER `gst_percent`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `student_courses`
--   DROP COLUMN `gst_amount`,
--   DROP COLUMN `gst_percent`;
-- ---------------------------------------------------------------------------
