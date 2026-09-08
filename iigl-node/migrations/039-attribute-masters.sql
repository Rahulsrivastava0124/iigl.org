-- ---------------------------------------------------------------------------
-- 039 — the attribute master list
--
-- `attributes` and `attribute_values` are per branch: an attribute belongs to
-- one category and one subcategory, and its values belong to that attribute.
-- So "Colour: D, E, F, G, H, I, J" is typed again, value by value, for every
-- subcategory that grades colour — and the seventh time somebody types it, one
-- of them is "Colour " or the list stops at H.
--
-- This is the library those lists are filled from. A master is an attribute
-- name under a category, with the values that attribute normally takes; the
-- Add Value form offers them as a multi-select, and what is chosen becomes real
-- `attribute_values` rows against the branch being worked on.
--
-- Deliberately separate from `attribute_values` rather than a flag on it. A
-- master value is not a value on any certificate — nothing points at it, moving
-- it breaks nothing, and deleting one must not be confused with retiring a
-- value that 22,103 certificates were written against.
--
-- Two tables rather than one, so a master has an id of its own: renaming the
-- attribute is one row, and Edit and Delete are the obvious URLs rather than a
-- composite key spelled out in a query string.
--
-- Additive. Nothing existing is read, written or dropped.
-- ---------------------------------------------------------------------------

CREATE TABLE `attribute_masters` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT NOT NULL,
  `attr_name`   VARCHAR(191) NOT NULL,
  `created_at`  DATETIME NULL DEFAULT NULL,
  `updated_at`  DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  -- One master per attribute name per category. The whole point is that a name
  -- has one agreed list; two rows for "Colour" under Diamond is the drift this
  -- exists to stop.
  UNIQUE KEY `attribute_masters_category_name` (`category_id`, `attr_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attribute_master_values` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `master_id`  BIGINT UNSIGNED NOT NULL,
  `value_name` VARCHAR(191) NOT NULL,
  -- The order the list is offered in. Grades are read D, E, F — not
  -- alphabetically by accident, and not in insertion order once one is fixed.
  `order_no`   INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NULL DEFAULT NULL,
  `updated_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `attribute_master_values_master_name` (`master_id`, `value_name`),
  KEY `attribute_master_values_master` (`master_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No foreign key on `master_id`, and none on `category_id`. The schema has none
-- on any of its 26 tables and the reasons are recorded in migrations/README.md;
-- adding one here alone would be the only enforced relationship in the
-- database. `DELETE /admin/attribute-masters/{id}` removes the values with the
-- master, in a transaction.

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE `attribute_master_values`;
-- DROP TABLE `attribute_masters`;
--
-- Nothing else reads either table, and no certificate or attribute value points
-- at one — a master is a template, and what was made from it is its own row.
-- ---------------------------------------------------------------------------
