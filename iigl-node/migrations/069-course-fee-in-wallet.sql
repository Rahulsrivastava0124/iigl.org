-- ---------------------------------------------------------------------------
-- 069 — students' course fees in head office's wallet
--
-- A course fee taken — at the desk, or online through Cashfree — raised
-- `student_courses.fee_paid` and nothing else, so the money never appeared in
-- head office's Wallet. From now on every fee payment is also a transaction:
--
--   transaction_type   'course_fee'
--   received_by        1, head office
--   send_by            0, nobody — a student has no account (the same sentinel a
--                      walk-in customer's collection uses)
--   status             1, approved: the money is in hand, or Cashfree confirmed it
--   pay_mode           cash, or online_<method>
--   student_course_id  the enrolment it was paid on — which is how the Wallet
--                      names the student, and how the two can be reconciled.
--
-- The fees already paid before this are added as one row per enrolment, dated
-- when the enrolment was made, with no pay mode (nobody recorded one), so the
-- Wallet's balance includes every fee head office has received.
-- ---------------------------------------------------------------------------

ALTER TABLE `transactions`
  ADD COLUMN `student_course_id` BIGINT NULL DEFAULT NULL AFTER `order_id`,
  ADD KEY `transactions_student_course` (`student_course_id`);

INSERT INTO `transactions`
  (`amount`, `comission_on`, `transaction_type`, `order_id`, `student_course_id`, `pay_mode`, `transaction_no`,
   `remark`, `attachment`, `send_by`, `received_by`, `status`, `seen_by_sender`, `seen_by_receiver`,
   `created_at`, `updated_at`)
SELECT sc.`fee_paid`, NULL, 'course_fee', NULL, sc.`id`, '', NULL,
       CONCAT('Course fee', IF(c.`name` IS NULL, '', CONCAT(' — ', c.`name`)), ' (paid before fees were recorded in the wallet).'),
       NULL, 0, 1, 1, 1, 1,
       sc.`created_at`, NOW()
  FROM `student_courses` sc
  LEFT JOIN `courses` c ON c.`id` = sc.`course_id`
 WHERE sc.`fee_paid` > 0
   AND NOT EXISTS (SELECT 1 FROM `transactions` t WHERE t.`student_course_id` = sc.`id`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DELETE FROM `transactions` WHERE `transaction_type` = 'course_fee';
-- ALTER TABLE `transactions` DROP KEY `transactions_student_course`, DROP COLUMN `student_course_id`;
-- ---------------------------------------------------------------------------
