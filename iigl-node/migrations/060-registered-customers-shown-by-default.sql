-- ---------------------------------------------------------------------------
-- 060 — registered customers are on the website unless hidden
--
-- 059 made listing opt-in: nothing showed until head office ticked it. Head
-- office wants the opposite — registering a customer is what puts them in the
-- website's Our Registered Customers section, and Website Setup › Customers is
-- where one is taken off.
--
-- The default becomes 1 for customers registered from now on, and every
-- existing customer is switched on. At the time of writing that is one row
-- (id 7), never unticked by anybody, so no deliberate "hide" is overwritten.
-- ---------------------------------------------------------------------------

ALTER TABLE `registered_customers`
  ALTER COLUMN `show_on_site` SET DEFAULT 1;

UPDATE `registered_customers` SET `show_on_site` = 1;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `registered_customers` ALTER COLUMN `show_on_site` SET DEFAULT 0;
-- UPDATE `registered_customers` SET `show_on_site` = 0;
-- ---------------------------------------------------------------------------
