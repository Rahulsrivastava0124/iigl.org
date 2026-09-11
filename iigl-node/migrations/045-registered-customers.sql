-- ---------------------------------------------------------------------------
-- 045 — a registered customer is a record, not a guess from an order
--
-- Until now there was no customer table. A customer was whoever had placed an
-- order, grouped by mobile number, and "registered" meant one of those orders
-- carried a GST number. That cannot hold somebody who has not ordered yet, and
-- it cannot hold anything about them an order does not — the company as against
-- the person, the city, the terms they have been given.
--
-- Two tables. The customer, owned by one laboratory: a franchise registers its
-- own trade customers, and the same number walking into two franchises is two
-- relationships with two sets of terms. And the discount they get, per
-- category, because a jeweller buying diamond certificates in bulk and the same
-- jeweller sending the odd gemstone are not on the same terms.
--
-- The discount is stored here and applied nowhere yet. Pricing is ported
-- behaviour, verified line by line against Laravel (docs/PARITY.md), and
-- wiring a per-category discount into it is a change to how an order is
-- billed — its own piece of work, not a side effect of adding a form.
--
-- Additive. Nothing existing is read, written or dropped; the order-derived
-- customer lists go on working exactly as they did.
-- ---------------------------------------------------------------------------

CREATE TABLE `registered_customers` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lab_id`       INT NOT NULL,
  `company_name` VARCHAR(191) NOT NULL,
  `owner_name`   VARCHAR(191) NOT NULL,
  -- The key every existing customer screen already groups by. Matching on it
  -- is what lets a registered customer's orders be found without a foreign key
  -- the orders table does not have.
  `mobile`       VARCHAR(20) NOT NULL,
  `email`        VARCHAR(191) NULL DEFAULT NULL,
  `city`         VARCHAR(191) NULL DEFAULT NULL,
  -- Required by the API, not by the column. "Registered" has always meant a GST
  -- number here, and a registered customer without one would be the first row
  -- to break that — but the check belongs where the reason can be said.
  `gst_no`       VARCHAR(20) NULL DEFAULT NULL,
  `created_by`   INT NULL DEFAULT NULL,
  `created_at`   DATETIME NULL DEFAULT NULL,
  `updated_at`   DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  -- One record per number per laboratory. Two franchises may each know the same
  -- customer; one franchise registering them twice is two sets of terms for one
  -- relationship, and nobody can then say which applies.
  UNIQUE KEY `registered_customers_lab_mobile` (`lab_id`, `mobile`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customer_category_discounts` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`   BIGINT UNSIGNED NOT NULL,
  `category_id`   INT NOT NULL,
  -- `percent` of the category's price, or `per_pc`, rupees off each piece. The
  -- same two words the laboratory commission already uses, so the panel reads
  -- one vocabulary for "how a rate is expressed".
  `discount_type` VARCHAR(10) NOT NULL DEFAULT 'percent',
  `value`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at`    DATETIME NULL DEFAULT NULL,
  `updated_at`    DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_category_discounts_pair` (`customer_id`, `category_id`),
  KEY `customer_category_discounts_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No foreign keys, as everywhere else in this schema (migrations/README.md).
-- Deleting a customer removes their discounts in the same transaction.

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE `customer_category_discounts`;
-- DROP TABLE `registered_customers`;
--
-- Read both out first. Nothing else holds these customers or their terms, and
-- the order-derived lists never did.
-- ---------------------------------------------------------------------------
