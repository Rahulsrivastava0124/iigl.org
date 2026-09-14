-- ---------------------------------------------------------------------------
-- 059 — registered customers on the website
--
-- The website's "Our Registered Customers" section shows the jewellers who
-- trade with IIGL: their logo, their area and city, and their number. A
-- registered customer record holds a company, a city and a mobile, but not what
-- that card needs, nor whether the customer agreed to be listed.
--
--   show_on_site   head office's decision, per customer, in Website Setup ›
--                  Customers. DEFAULT 0: a customer's name and phone number go
--                  onto the public site only when somebody ticks them — never as
--                  a side effect of this column arriving.
--   state          the website filters by state, then city.
--   area           the locality printed before the city — "Salkia" in
--                  "Salkia, Howrah".
--   logo           an uploaded path, `public/uploads/...`, like every other.
--
-- Additive. No existing row is read or changed beyond taking the defaults.
-- ---------------------------------------------------------------------------

ALTER TABLE `registered_customers`
  ADD COLUMN `area` VARCHAR(191) NULL DEFAULT NULL AFTER `email`,
  ADD COLUMN `state` VARCHAR(100) NULL DEFAULT NULL AFTER `city`,
  ADD COLUMN `logo` VARCHAR(255) NULL DEFAULT NULL AFTER `state`,
  ADD COLUMN `show_on_site` TINYINT(1) NOT NULL DEFAULT 0 AFTER `logo`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `registered_customers`
--   DROP COLUMN `show_on_site`,
--   DROP COLUMN `logo`,
--   DROP COLUMN `state`,
--   DROP COLUMN `area`;
-- ---------------------------------------------------------------------------
