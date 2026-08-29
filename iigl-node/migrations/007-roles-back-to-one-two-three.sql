-- ---------------------------------------------------------------------------
-- 007 — the roles are 1, 2, 3
--
-- Reverses migration 006. The numbering is:
--
--     1  super admin   IIGL head office
--     2  admin         a laboratory. **The same thing**: a laboratory account
--                      is its admin, not a separate kind of user.
--     3  team          their staff. 4 (manager) and 5 (office boy) are team
--                      variants that predate this, and any custom role above.
--
--     NULL             no role at all — permissions granted one by one, from
--                      migration 005. Unchanged by this file.
--
-- 006 moved head office to role 0. That was wrong, and this puts it back. Role
-- 0 is deleted rather than kept: it existed for one migration, no account holds
-- it after this runs, and leaving an empty "super admin" at 0 beside the real
-- one at 1 is the kind of thing somebody writes a guard against later.
--
-- ## What "admin and laboratory are not different" means for the data
--
-- Nothing here needs to change for it — `frenchise` (2) already *is* the
-- laboratory owner's account, and no third row was ever created for an "admin".
-- The change is in the naming: role 2 is renamed from `frenchise` to `admin`,
-- and the code stops describing 2 as "the laboratory, which is not the admin".
--
-- Safe to re-run: every statement is idempotent.
--
--   npm run migrate -- --allow-drop
-- ---------------------------------------------------------------------------

-- ----------------------------------------------------- 1. head office is 1
UPDATE `users` SET `role_id` = 1, `updated_at` = NOW() WHERE `role_id` = 0;
UPDATE `role_permissions` SET `role_id` = 1, `updated_at` = NOW() WHERE `role_id` = 0;

-- ------------------------------------------------- 2. role 0 goes first
--
-- Before the renames, not after: `roles.role_name` is unique, and role 0 is
-- already called "super admin", so renaming role 1 to it while 0 still exists
-- collides. Head office has been moved off 0 by the statement above, so this
-- deletes a row nobody holds.
DELETE FROM `role_permissions` WHERE `role_id` = 0;
DELETE FROM `roles` WHERE `id` = 0;

-- ------------------------------------------------------- 3. the role names
UPDATE `roles`
   SET `role_name` = 'super admin',
       `is_system` = 1,
       `owner_id` = NULL,
       `description` = 'IIGL head office. Every laboratory, and the catalogue, prices and website.',
       `updated_at` = NOW()
 WHERE `id` = 1;

UPDATE `roles`
   SET `role_name` = 'admin',
       `is_system` = 1,
       `owner_id` = NULL,
       `description` = 'A laboratory. The laboratory account is its admin — they are the same user.',
       `updated_at` = NOW()
 WHERE `id` = 2;

UPDATE `roles`
   SET `role_name` = 'team',
       `is_system` = 1,
       `description` = 'Staff of head office or of a laboratory.',
       `updated_at` = NOW()
 WHERE `id` = 3;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- 006's rollback, in reverse. Only worth running to get back to role 0, which
-- nothing wants:
--
--   INSERT INTO `roles` (`id`, `role_name`, `is_system`) VALUES (0, 'super admin', 1);
--   UPDATE `users` SET `role_id` = 0 WHERE `role_id` = 1;
--   UPDATE `role_permissions` SET `role_id` = 0 WHERE `role_id` = 1;
--
-- `users.role_id` stays nullable either way: that is migration 005's no-role
-- account, and is unrelated to which number head office holds.
-- ---------------------------------------------------------------------------
