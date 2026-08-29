-- @blocked a deliberate data reset — run by hand with a backup, never by the runner
-- ---------------------------------------------------------------------------
-- 010 — reset to one account
--
-- **This deletes production-shaped data.** It is not part of the migration path
-- to cutover — it is a hand-run reset, kept here so what it did is on the
-- record. The `@blocked` marker at the top keeps `npm run migrate` from ever
-- applying it by accident.
--
-- ## What it keeps
--
--   users        id 1 only — head office
--   roles        all five, and any custom role. A role holds nobody after this,
--                but deleting 2 and 3 would leave no way to create a laboratory
--                or a team member again.
--   catalogue    categories, subcategories, attributes, values, units, the
--                standard price bands, website content. None of it belongs to
--                an account.
--
-- ## What it deletes, and why it has to
--
-- Every laboratory **is** a user, so removing the other 23 accounts orphans
-- everything they own. Left behind, an order would name a laboratory that does
-- not exist, and every scoped list would show rows belonging to nobody. So the
-- work goes with the people:
--
--   9,608 orders and 9,674 order details
--   22,103 certificates
--   297 transactions
--   16 employments
--   7 attendance days
--   6 laboratory price bands (the standard bands stay)
--   2,142 certificate verification lookups
--
-- Backup taken before running:
--   iigl-backup-before-reset-2026-08-29.sql  (15 MB, full dump)
--
-- Restore with:
--   mysql -u root -p iigl < iigl-backup-before-reset-2026-08-29.sql
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- the work
DELETE FROM `reports`;
DELETE FROM `order_details`;
DELETE FROM `orders`;
DELETE FROM `reportsearches`;
DELETE FROM `transactions`;
DELETE FROM `attendances`;

-- The student pipeline is already empty, but it belongs to laboratories too, so
-- it is cleared here rather than left to a later surprise.
DELETE FROM `student_certificates`;
DELETE FROM `student_courses`;
DELETE FROM `student_enquiries`;
DELETE FROM `students`;
DELETE FROM `courses`;
DELETE FROM `enquiries`;

-- ---------------------------------------------------------- the people
DELETE FROM `employements`;
DELETE FROM `user_permissions` WHERE `user_id` <> 1;

-- Laboratory price bands belong to a laboratory. The standard bands — lab_id
-- NULL — are the catalogue and stay.
DELETE FROM `prices` WHERE `lab_id` IS NOT NULL;

DELETE FROM `users` WHERE `id` <> 1;

-- Head office belongs to nobody, which is what NULL means here.
UPDATE `users` SET `parent_id` = NULL WHERE `id` = 1;

-- Custom roles created by a laboratory that no longer exists. The five system
-- roles stay: they are how the next laboratory and the next team member get
-- created.
DELETE FROM `role_permissions`
 WHERE `role_id` IN (SELECT `id` FROM `roles` WHERE `is_system` = 0);
DELETE FROM `roles` WHERE `is_system` = 0;

-- ---------------------------------------------------------------------------
-- No rollback.
--
-- Deleted rows are gone. The backup named above is the only way back, and it
-- restores the whole database rather than any part of it.
-- ---------------------------------------------------------------------------
