-- ---------------------------------------------------------------------------
-- 074 — how much of an invoice was paid
--
-- A line is not always settled in full on the day it is entered: some of it is
-- paid, the rest is owed. `paid_amount` holds what was actually handed over,
-- and the balance due is the total less it.
--
-- On a purchase the wallet moves by what was paid, not by the whole total — an
-- unpaid bill has taken no money out yet. Existing rows are treated as paid in
-- full, which is what they were before this column existed.
--
-- Additive.
-- ---------------------------------------------------------------------------

ALTER TABLE `purchases`
  ADD COLUMN `paid_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `amount`;

ALTER TABLE `sales`
  ADD COLUMN `paid_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `amount`;

-- Everything already on the books was entered as settled.
UPDATE `purchases` SET `paid_amount` = `amount`;
UPDATE `sales` SET `paid_amount` = `amount`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `sales` DROP COLUMN `paid_amount`;
-- ALTER TABLE `purchases` DROP COLUMN `paid_amount`;
