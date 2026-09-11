-- ---------------------------------------------------------------------------
-- 049 — how head office bills a laboratory its commission
--
-- Commission accrued and was paid whenever a laboratory chose to: there was a
-- running "due" and nothing that said when any of it fell due. Head office now
-- bills it on a period, and a laboratory that has not settled a statement in
-- full within its grace days cannot generate certificates until it has.
--
--   statement_period      months per statement: 1, 3, 6 or 12
--   statement_grace_days  days after billing to pay in full, 15 unless changed
--   statement_from        the first month billed; NULL reads as September 2026,
--                         or the month the laboratory was added if that is later
--
-- On `users`, beside `commision` and `commission_type`: they are the other half
-- of the same terms, and set on the same form.
--
-- Additive. The two defaults describe what head office asked for; NULL in
-- `statement_from` means no laboratory is billed for anything before this
-- feature existed, so nobody is locked out on the day it ships.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `statement_period`     TINYINT UNSIGNED  NOT NULL DEFAULT 1  AFTER `registration_fee`,
  ADD COLUMN `statement_grace_days` SMALLINT UNSIGNED NOT NULL DEFAULT 15 AFTER `statement_period`,
  ADD COLUMN `statement_from`       DATE              NULL DEFAULT NULL   AFTER `statement_grace_days`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users`
--   DROP COLUMN `statement_from`, DROP COLUMN `statement_grace_days`, DROP COLUMN `statement_period`;
-- ---------------------------------------------------------------------------
