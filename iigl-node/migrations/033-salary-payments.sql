-- ---------------------------------------------------------------------------
-- 033 — salary paid, per person per month
--
-- The schema records what somebody is *owed* — `employements.salary`, a monthly
-- figure — and nothing at all about what they have been *paid*. The salary
-- screen could therefore only ever do arithmetic: here is the agreed salary,
-- here are the days attended, here is the product. Useful, and not a record of
-- anything.
--
-- This is that record. One row per payment, not per month: a month is often
-- paid in parts, and a table that assumed one payment would have to be
-- overwritten to hold the second — which is how a part payment becomes the only
-- payment.
--
--   month          the month it is *for*, as YYYY-MM. Not a date: a payment for
--                  August made in September belongs to August, and a date would
--                  put it in the wrong one.
--   paid_on        when it actually changed hands.
--   days_present   what attendance said at the time, kept because attendance
--                  can be corrected afterwards and a payslip that changes when
--                  somebody edits a punch is not a receipt.
--   salary_month   the agreed monthly salary at the time, for the same reason.
--
-- Not in `transactions`. That table is the commission ledger between head office
-- and its laboratories, with an approval each row waits on; salary is an
-- employer paying its own staff and waits on nobody. Putting it there would put
-- payroll into the wallet balance.
--
-- New table. Nothing existing is touched.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `salary_payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `emp_id` bigint unsigned NOT NULL,
  -- Who paid: the laboratory, or head office. A `users.id`, like the employee.
  `paid_by` bigint unsigned NOT NULL,
  `month` char(7) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `paid_on` date NOT NULL,
  `pay_mode` varchar(20) NOT NULL DEFAULT 'cash',
  `reference` varchar(100) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  -- What the figures were when this was paid.
  `salary_month` decimal(12,2) DEFAULT NULL,
  `days_present` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  -- The two ways this is read: one person's history, and a month's payroll.
  KEY `salary_payments_emp_index` (`emp_id`, `month`),
  KEY `salary_payments_month_index` (`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE IF EXISTS `salary_payments`;
-- ---------------------------------------------------------------------------
