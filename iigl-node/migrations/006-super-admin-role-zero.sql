-- ---------------------------------------------------------------------------
-- 006 — super admin becomes role 0
--
-- Head office was role 1, `roles.role_name = "administrator"`. It becomes
-- **role 0, "super admin"**, which is the numbering the business uses.
--
-- Everything else keeps its number: laboratory stays 2, lab employee 3, manager
-- 4, office boy 5. Only the top of the ladder moves.
--
-- ## This frees 0 from another meaning, so that one has to move first
--
-- Migration 005 used `role_id = 0` for "no role — permissions granted
-- individually". 0 is now super admin, so no-role becomes **NULL**, and
-- `users.role_id` is made nullable to hold it.
--
-- Nothing in the data uses either value today: no user has role 0, and none has
-- NULL. The change is therefore a redefinition of two unused values rather than
-- a rewrite of anybody's access.
--
-- ## What this breaks, and why it is still right
--
-- The Laravel application checks `role_id == 1` for an administrator, in
-- controllers and in Blade. **After this migration, its two administrators can
-- sign in there but will be treated as ordinary users.** That is a real
-- consequence and the reason to run this at cutover rather than beside a live
-- Laravel install: the new panel is the one that understands role 0.
--
-- The old row is kept as a tombstone rather than deleted, so a `role_id = 1`
-- found anywhere later still resolves to a name instead of a blank.
--
--   npm run migrate
-- ---------------------------------------------------------------------------

-- MySQL turns an explicit 0 in an AUTO_INCREMENT column into "next value"
-- unless this is set. It applies to this session only.
SET SESSION sql_mode = CONCAT(@@SESSION.sql_mode, ',NO_AUTO_VALUE_ON_ZERO');

-- ------------------------------------------------------- 1. no role is NULL
--
-- Nullable, so a person can exist with no role and only their own grants. Every
-- existing row keeps the number it has.
ALTER TABLE `users` MODIFY COLUMN `role_id` bigint unsigned NULL;

-- ------------------------------------------------------- 2. the new role 0
INSERT INTO `roles` (`id`, `role_name`, `owner_id`, `is_system`, `description`, `created_at`, `updated_at`)
VALUES (0, 'super admin', NULL, 1, 'IIGL head office. Sees every laboratory and owns the catalogue, prices and website.', NOW(), NOW())
ON DUPLICATE KEY UPDATE `role_name` = VALUES(`role_name`), `is_system` = 1;

-- --------------------------------------------- 3. move head office onto it
UPDATE `users` SET `role_id` = 0, `updated_at` = NOW() WHERE `role_id` = 1;

-- The permission rows follow the role. Every role 1 flag is zero — head office
-- is unconditional in code and the matrix has never described it — so this
-- moves nothing but the row itself.
UPDATE `role_permissions` SET `role_id` = 0, `updated_at` = NOW() WHERE `role_id` = 1;

-- --------------------------------------------------------- 4. the old row
--
-- Kept, renamed to say what it is. Deleting it would leave any `role_id = 1`
-- still lying about in an export or a log resolving to nothing at all.
UPDATE `roles`
   SET `role_name` = 'administrator (retired — now role 0)',
       `is_system` = 1,
       `description` = 'Replaced by role 0. Kept so an old role_id = 1 still resolves to a name.',
       `updated_at` = NOW()
 WHERE `id` = 1;

-- ---------------------------------------------------------------------------
-- Rollback
--
--   UPDATE `users` SET `role_id` = 1 WHERE `role_id` = 0;
--   UPDATE `role_permissions` SET `role_id` = 1 WHERE `role_id` = 0;
--   UPDATE `roles` SET `role_name` = 'administrator',
--          `description` = NULL WHERE `id` = 1;
--   DELETE FROM `roles` WHERE `id` = 0;
--   -- and, only if no user holds NULL:
--   ALTER TABLE `users` MODIFY COLUMN `role_id` bigint unsigned NOT NULL;
--
-- Reversing this does not restore the old application's understanding on its
-- own: anything created in the new panel with no role at all would have to be
-- given one first.
-- ---------------------------------------------------------------------------
