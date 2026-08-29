-- ---------------------------------------------------------------------------
-- 009 — `parent_id` holds an `empid`, not a `users.id`
--
-- Both parent columns pointed at an employer by primary key:
--
--   employements.parent_id   bigint unsigned NOT NULL   12
--   users.parent_id          bigint unsigned NULL       12
--
-- They now hold that employer's `users.empid` instead:
--
--   employements.parent_id   varchar(50) NOT NULL       'LAB0005'
--   users.parent_id          varchar(50) NULL           'LAB0005'
--
-- ## Why this is safe as a key
--
-- `users.empid` is `varchar(50)` and carries a UNIQUE index, so it identifies a
-- row exactly as well as the primary key does. Checked before writing this:
-- every one of the 24 accounts has an empid, the longest is 9 characters, and
-- every parent — on both columns — resolves to an account that has one. Nothing
-- is lost in the conversion and nothing needs a default.
--
-- ## What it costs
--
-- `empid` is editable (PATCH /api/users/{id} sets it) while an id is not, so a
-- renamed empid orphans every row pointing at it. There is no foreign key in
-- this schema to refuse that, so the API refuses instead: an `empid` that any
-- parent still points at cannot be changed, and `npm run check:parents` reports
-- any parent that no longer resolves. A hand-written UPDATE can still do it —
-- that is the thing to remember about this column.
--
-- The Laravel application, until cutover, writes `employements` with a numeric
-- parent. Those rows land as the digits of a user id ('12') in a varchar column
-- and resolve to no employer. `check:parents` names them.
--
-- ## Shape of the change
--
-- Add a text column beside each numeric one, backfill it through `users.id`,
-- make it NOT NULL where the old one was — that is the guard: under
-- STRICT_TRANS_TABLES a posting that failed to resolve cannot be made NOT NULL,
-- so the migration stops before anything is dropped — then drop the numeric
-- column and take its name.
--
-- Both indexes on `employements.parent_id` go with the column and are recreated
-- by the same name: `employements_parent_id_foreign` (a Laravel leftover; there
-- are no foreign keys here) and `idx_employements_parent` from migration 001.
--
-- **This file drops two columns**, inside `ALTER TABLE`. The runner's
-- `--allow-drop` guard only recognises a statement that begins with `DROP`, so
-- it will not stop to ask. Take a dump first.
--
--   npm run migrate
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------ employements

ALTER TABLE `employements`
  ADD COLUMN `parent_empid` varchar(50) NULL AFTER `parent_id`;

UPDATE `employements` e
  JOIN `users` p ON p.id = e.parent_id
   SET e.parent_empid = p.empid;

-- The guard. A posting whose employer did not resolve is still NULL here, and
-- NOT NULL cannot be applied over it, so the drop below is never reached with
-- data unaccounted for.
ALTER TABLE `employements`
  MODIFY COLUMN `parent_empid` varchar(50) NOT NULL;

-- Both indexes go first, by name. Dropping the column alone is not enough:
-- MySQL removes it from `idx_employements_parent` and leaves the index behind
-- as `(is_working)`, so recreating it by that name fails on a duplicate key.
ALTER TABLE `employements`
  DROP KEY `employements_parent_id_foreign`,
  DROP KEY `idx_employements_parent`,
  DROP COLUMN `parent_id`;

ALTER TABLE `employements`
  CHANGE COLUMN `parent_empid` `parent_id` varchar(50) NOT NULL AFTER `user_id`;

ALTER TABLE `employements`
  ADD KEY `employements_parent_id_foreign` (`parent_id`),
  ADD KEY `idx_employements_parent` (`parent_id`, `is_working`);

-- ------------------------------------------------------------------- users

ALTER TABLE `users`
  ADD COLUMN `parent_empid` varchar(50) NULL AFTER `parent_id`;

UPDATE `users` u
  JOIN `users` p ON p.id = u.parent_id
   SET u.parent_empid = p.empid;

-- No guard here: the column is nullable on purpose. A laboratory and head
-- office work for nobody, and somebody who has left keeps NULL rather than
-- their last employer. A row that failed to resolve is caught by
-- `npm run check:parents` instead.
ALTER TABLE `users`
  DROP KEY `users_parent_id_index`,
  DROP COLUMN `parent_id`;

ALTER TABLE `users`
  CHANGE COLUMN `parent_empid` `parent_id` varchar(50) DEFAULT NULL AFTER `role_id`;

ALTER TABLE `users`
  ADD KEY `users_parent_id_index` (`parent_id`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- The employer is still identified, so the reverse is the same shape read the
-- other way — join back through `users.empid`:
--
--   ALTER TABLE `employements` ADD COLUMN `parent_uid` bigint unsigned NULL AFTER `parent_id`;
--   UPDATE `employements` e JOIN `users` p ON p.empid = e.parent_id SET e.parent_uid = p.id;
--   ALTER TABLE `employements` MODIFY COLUMN `parent_uid` bigint unsigned NOT NULL;
--   ALTER TABLE `employements`
--     DROP KEY `employements_parent_id_foreign`, DROP KEY `idx_employements_parent`, DROP COLUMN `parent_id`;
--   ALTER TABLE `employements` CHANGE COLUMN `parent_uid` `parent_id` bigint unsigned NOT NULL AFTER `user_id`;
--   ALTER TABLE `employements`
--     ADD KEY `employements_parent_id_foreign` (`parent_id`),
--     ADD KEY `idx_employements_parent` (`parent_id`, `is_working`);
--
--   ALTER TABLE `users` ADD COLUMN `parent_uid` bigint unsigned NULL AFTER `parent_id`;
--   UPDATE `users` u JOIN `users` p ON p.empid = u.parent_id SET u.parent_uid = p.id;
--   ALTER TABLE `users` DROP KEY `users_parent_id_index`, DROP COLUMN `parent_id`;
--   ALTER TABLE `users` CHANGE COLUMN `parent_uid` `parent_id` bigint unsigned DEFAULT NULL AFTER `role_id`;
--   ALTER TABLE `users` ADD KEY `users_parent_id_index` (`parent_id`);
--
-- A row whose empid was renamed in the meantime does not come back. Check that
-- `npm run check:parents` is clean before rolling back.
-- ---------------------------------------------------------------------------
