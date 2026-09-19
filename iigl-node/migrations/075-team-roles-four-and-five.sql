-- ---------------------------------------------------------------------------
-- 075 — roles 4 and 5 get the grants that came back without them
--
-- The production load restored **MANAGER** (4) and **Office Boy** (5) to
-- `roles`, because one live account holds role 4 and CLAUDE.md names both as
-- team roles. It did not bring their `role_permissions`: that table had been
-- re-authored in the panel since the reset, and copying the Laravel rows over
-- it would have undone that work.
--
-- So the two roles came back holding nothing. `can()` reads the matrix for any
-- role that is not head office or a laboratory, finds no row, and answers no to
-- everything — which is not "no permissions" on a screen, it is a panel with
-- every list empty and no menu entries. `orderVisibility()` falls to `'own'` on
-- the same reading, so an employee on role 4 sees only orders they took
-- themselves, in place of their laboratory's.
--
--   role 1  super admin   14 rows
--   role 2  admin         14 rows
--   role 3  Team          14 rows
--   role 4  MANAGER        0        ← one active account, CHHOTU KUMAR
--   role 5  Office Boy     0
--
-- ## What they are given
--
-- Role 3's grants, exactly. Roles 4 and 5 are team under another name — that is
-- what CLAUDE.md says of them and what the Laravel data did with them — so the
-- faithful answer is the one team already has rather than a set invented here.
-- Anybody who wants a manager to have more can raise it in the panel, which is
-- where role grants are edited now.
--
-- Guarded by NOT EXISTS on (role_id, action_type), so running this twice adds
-- nothing the second time and a grant edited in the panel afterwards is not
-- overwritten by a later run.
--
-- ## And three rows belonging to nobody
--
-- Role 9 was a custom role owned by test laboratory 26. Both were deleted by
-- the production load; the role's three grant rows were not, because nothing in
-- this schema makes them go. They are removed by the join below, which finds
-- any `role_permissions` row whose role no longer exists rather than naming 9 —
-- the next deleted role leaves the same litter.
--
--   npm run migrate
-- ---------------------------------------------------------------------------

INSERT INTO `role_permissions`
  (`role_id`, `action_type`, `view`, `create`, `update`, `delete`, `created_at`, `updated_at`)
SELECT r.`id`, rp.`action_type`, rp.`view`, rp.`create`, rp.`update`, rp.`delete`, NOW(), NOW()
  FROM `roles` r
  JOIN `role_permissions` rp ON rp.`role_id` = 3
 WHERE r.`id` IN (4, 5)
   AND NOT EXISTS (
     SELECT 1 FROM `role_permissions` x
      WHERE x.`role_id` = r.`id` AND x.`action_type` = rp.`action_type`
   );

DELETE rp FROM `role_permissions` rp
  LEFT JOIN `roles` r ON r.`id` = rp.`role_id`
 WHERE r.`id` IS NULL;

-- ---------------------------------------------------------------------------
-- Rollback
--
--   DELETE FROM `role_permissions` WHERE `role_id` IN (4, 5);
--
-- The role 9 rows are not recoverable and are not worth recovering: the role
-- they belonged to no longer exists and no account holds it.
-- ---------------------------------------------------------------------------
