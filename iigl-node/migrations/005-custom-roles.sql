-- ---------------------------------------------------------------------------
-- 005 — custom roles, a permission list that can grow, and per-user grants
--
-- Three changes, all additive:
--
--   1. a role can be **created** by head office or by a laboratory, and belongs
--      to whoever created it;
--   2. the list of permissions is a table rather than a constant in the code, so
--      a new one can be added without a deployment;
--   3. a user can hold **no role at all** and be granted permissions
--      individually.
--
-- Nothing is dropped, no column changes type, and every existing row keeps the
-- meaning it had. `roles` gains two columns with defaults that describe what is
-- already true of the five rows in it.
--
-- ## Why `role_id = 0` rather than NULL
--
-- `users.role_id` is NOT NULL and the Laravel application reads it on every
-- request. Making it nullable is a change to a column another running
-- application depends on; **0** is a value it already accepts, and it means "no
-- role — look at this person's own grants". No existing row uses it.
--
-- The old application will not understand such a user: `filterPermission()`
-- finds no row for role 0 and returns null. That is acceptable because a user
-- with no role can only be created in the new panel, and the old one is being
-- replaced — but it is the reason not to create one until cutover.
--
--   npm run migrate
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------------- 1. roles
ALTER TABLE `roles`
  -- The laboratory that created it. NULL means head office, and a head-office
  -- role is offered to every laboratory; a laboratory's own role is offered
  -- only to that laboratory's staff.
  ADD COLUMN `owner_id` bigint unsigned DEFAULT NULL AFTER `role_name`,

  -- The five that shipped with the Laravel application. They can be granted and
  -- revoked but not renamed or deleted: code branches on 1 and 2 by number, and
  -- 3 is what every existing employee holds.
  ADD COLUMN `is_system` tinyint(1) NOT NULL DEFAULT 0 AFTER `owner_id`,

  ADD COLUMN `description` varchar(255) DEFAULT NULL AFTER `is_system`,
  ADD KEY `roles_owner_id_index` (`owner_id`);

UPDATE `roles` SET `is_system` = 1 WHERE `id` <= 5;

-- ------------------------------------------------------- 2. the permission list
--
-- Seeded with the fourteen action types already present in `role_permissions`,
-- so nothing changes on the day this runs. `is_system` marks the ones the API
-- enforces in code; a new one added through the panel is a label until somebody
-- writes the check that reads it, which the panel says on the screen.
CREATE TABLE IF NOT EXISTS `permission_actions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `label` varchar(120) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `added_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permission_actions_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permission_actions` (`name`, `label`, `is_system`, `created_at`, `updated_at`) VALUES
  ('product_collection', 'Orders', 1, NOW(), NOW()),
  ('report', 'Certificates', 1, NOW(), NOW()),
  ('account', 'Accounts and ledger', 1, NOW(), NOW()),
  ('customer', 'Customers', 1, NOW(), NOW()),
  ('employee_management', 'Employees', 1, NOW(), NOW()),
  ('admin_employee', 'Head office employees', 1, NOW(), NOW()),
  ('laboratory', 'Laboratories', 1, NOW(), NOW()),
  ('visitor_book', 'Visitor book', 1, NOW(), NOW()),
  ('website_blog', 'Website — blog', 1, NOW(), NOW()),
  ('website_contact', 'Website — contact', 1, NOW(), NOW()),
  ('website_education', 'Website — education', 1, NOW(), NOW()),
  ('website_enquiry', 'Website — enquiry', 1, NOW(), NOW()),
  ('website_home', 'Website — home', 1, NOW(), NOW()),
  ('website_report', 'Website — report', 1, NOW(), NOW());

-- ------------------------------------------------------ 3. per-user grants
--
-- One row per person per action. A row here **wins over the role**, which is
-- what makes a user with no role possible: they have no role rows, so their own
-- are all there is.
--
-- Deliberately the same four flags as `role_permissions` rather than a clever
-- allow/deny overlay: two shapes for one idea is how a permission system starts
-- disagreeing with itself.
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `action_type` varchar(60) NOT NULL,
  `view` tinyint(1) NOT NULL DEFAULT 0,
  `create` tinyint(1) NOT NULL DEFAULT 0,
  `update` tinyint(1) NOT NULL DEFAULT 0,
  `delete` tinyint(1) NOT NULL DEFAULT 0,
  `granted_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_permissions_user_action_unique` (`user_id`, `action_type`),
  KEY `user_permissions_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
--   DROP TABLE IF EXISTS `user_permissions`;
--   DROP TABLE IF EXISTS `permission_actions`;
--   ALTER TABLE `roles`
--     DROP KEY `roles_owner_id_index`,
--     DROP COLUMN `description`,
--     DROP COLUMN `is_system`,
--     DROP COLUMN `owner_id`;
--
-- Any role created after this migration would lose its owner and become a
-- head-office role; any per-user grant would be lost, and those users fall back
-- to their role, or to nothing if they have none.
-- ---------------------------------------------------------------------------
