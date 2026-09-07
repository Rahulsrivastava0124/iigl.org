-- ---------------------------------------------------------------------------
-- 036 — Attendance and Message become grantable
--
-- `permission_actions` holds fourteen rows, one per screen a grant can be
-- written about. Two screens an employee actually uses are not among them:
--
--   attendance   their own month — punching in, punching out, reading it back.
--   message      writing to their employer, and reading what comes back.
--
-- Both were built after the fourteen were settled, so a laboratory deciding
-- what its front desk may do had no way to say anything about either. This adds
-- the two rows; the panel's Roles & Permissions screen picks them up from the
-- table without a change to it.
--
-- `is_system` is 1: these ship with the panel and are not a laboratory's to
-- rename or remove, the same as the other fourteen.
--
-- What they govern, honestly: the panel shows or hides the screens by them.
-- The API still scopes attendance and messages to the person and their
-- employer, as it did before — nobody could read somebody else's either way —
-- so these decide what is offered, not what is reachable by other means. The
-- roles screen already says "not enforced yet" for a grant the server does not
-- check in code, and it will say it for these until one does.
-- ---------------------------------------------------------------------------

INSERT INTO `permission_actions` (`name`, `label`, `description`, `is_system`, `created_at`, `updated_at`)
SELECT * FROM (
  SELECT 'attendance' AS name, 'Attendance' AS label,
         'Their own month: punching in and out, and reading it back.' AS description,
         1 AS is_system, NOW() AS created_at, NOW() AS updated_at
  UNION ALL
  SELECT 'message', 'Messages',
         'Writing to their employer, and reading the replies.',
         1, NOW(), NOW()
) AS incoming
WHERE NOT EXISTS (
  SELECT 1 FROM `permission_actions` p WHERE p.name = incoming.name
);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DELETE FROM `permission_actions` WHERE `name` IN ('attendance', 'message');
-- DELETE FROM `role_permissions`   WHERE `action_type` IN ('attendance', 'message');
-- DELETE FROM `user_permissions`   WHERE `action_type` IN ('attendance', 'message');
-- ---------------------------------------------------------------------------
