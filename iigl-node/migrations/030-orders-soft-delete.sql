-- ---------------------------------------------------------------------------
-- 030 — deleting an order hides it, it does not remove it
--
-- `DELETE /api/orders/{id}` removed the row and its lines. That is the one
-- operation in this system with no record of itself: an order that is gone
-- leaves nothing saying it ever existed, who took it, or who removed it. The
-- order numbers are sequential per month, so a deleted one also leaves a hole
-- nobody can account for afterwards.
--
-- One column. A row with `deleted_at` set is deleted as far as every screen is
-- concerned — it is out of the lists, out of the counts, out of the money — and
-- the row itself stays where it is, with its customer, its date and its lines.
--
-- NULL means live, which is what all 9,608 existing rows already are, so this
-- changes nothing that is already there.
--
-- **Every read of `orders` must exclude these rows.** There are thirty query
-- sites and no foreign keys; a read that forgets puts a deleted order back into
-- a total silently. `liveOrders()` in `src/services/order.service.ts` is the
-- one place that filter is written, and `npm run check:soft-delete` fails if a
-- query goes round it.
--
-- Additive. Nothing is dropped and no existing value changes.
-- ---------------------------------------------------------------------------

ALTER TABLE `orders`
  ADD COLUMN `deleted_at` DATETIME NULL DEFAULT NULL AFTER `updated_at`;

-- Every list, count and sum filters on this column, and all of them are already
-- narrowed by `lab_id` first. Leading with `deleted_at` would put the selective
-- column second in a composite that MySQL reads left to right, so this indexes
-- the pair in the order the queries use them.
CREATE INDEX `orders_lab_deleted` ON `orders` (`lab_id`, `deleted_at`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP INDEX `orders_lab_deleted` ON `orders`;
-- ALTER TABLE `orders` DROP COLUMN `deleted_at`;
--
-- Read out the rows where `deleted_at` is not null first. Dropping the column
-- restores every deleted order to every list and every total at once, and
-- nothing afterwards can tell which ones those were.
-- ---------------------------------------------------------------------------
