-- ---------------------------------------------------------------------------
-- 072 — the salaries already paid, as wallet movements
--
-- A salary payment used to write `salary_payments` alone: the payslip existed,
-- the money never left the employer's wallet. From now on both rows are written
-- together; this is the catch-up for the ones recorded before that.
--
-- One transaction per salary_payments row that has none, dated by `paid_on` and
-- approved — the employer paid it, and nobody approves their own outgoing
-- salary. Matched on employer, employee, amount and day, so running it twice
-- inserts nothing the second time.
-- ---------------------------------------------------------------------------

INSERT INTO `transactions`
  (`amount`, `pay_mode`, `transaction_no`, `transaction_type`, `remark`,
   `send_by`, `received_by`, `status`, `seen_by_sender`, `seen_by_receiver`,
   `created_at`, `updated_at`)
SELECT
  sp.`amount`,
  sp.`pay_mode`,
  sp.`reference`,
  'salary',
  CONCAT('Salary for ', sp.`month`, IF(sp.`note` IS NULL OR sp.`note` = '', '', CONCAT(' — ', sp.`note`))),
  sp.`paid_by`,
  sp.`emp_id`,
  1,
  1,
  0,
  sp.`paid_on`,
  NOW()
FROM `salary_payments` sp
WHERE NOT EXISTS (
  SELECT 1 FROM `transactions` t
  WHERE t.`transaction_type` = 'salary'
    AND t.`send_by` = sp.`paid_by`
    AND t.`received_by` = sp.`emp_id`
    AND t.`amount` = sp.`amount`
    AND DATE(t.`created_at`) = DATE(sp.`paid_on`)
);
