-- ---------------------------------------------------------------------------
-- 029 — commission is a percentage or a rate per piece
--
-- `users.commision` holds a number and everything that reads it assumes the
-- number is a percentage: the franchisee form prints "10 %" and "Ten Percent",
-- and every accrual multiplies what a laboratory collected by it and divides
-- by a hundred. Not every franchise is on those terms. Some are paid a flat
-- amount per piece certified, where the same column means ₹15 and the money is
-- pieces × 15 — a figure that has nothing to do with what the order was worth.
--
-- One column says which reading applies:
--
--   percent  the rate is a percentage of what the laboratory collected
--   per_pc   the rate is rupees per piece, against `order_details.qty`
--
-- Defaulting to `percent` is what every existing row already means, so nothing
-- changes for anybody: the same number, read the same way, printing the same
-- words. Only a laboratory somebody deliberately switches reads differently.
--
-- The rate itself keeps its column. Two columns for one number is how a
-- laboratory ends up with a percentage in one and a per-piece rate in the
-- other and no way to tell which the agreement was.
--
-- Additive. Nothing is dropped and no existing value changes.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `commission_type` VARCHAR(10) NOT NULL DEFAULT 'percent' AFTER `commision`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users` DROP COLUMN `commission_type`;
--
-- Read out the per_pc rows first: their `commision` is rupees, not a percent,
-- and without this column nothing can tell the difference.
-- ---------------------------------------------------------------------------
