-- ---------------------------------------------------------------------------
-- 037 — what the Attendance grant actually decides
--
-- 036 added `attendance` to `permission_actions` so a laboratory could say
-- whether its front desk sees that screen. In use it decided the wrong thing:
-- a role starts with no grants, so a new employee could punch in from the
-- clock in the bar — which asks nobody — and then had nowhere to read back what
-- they had punched. A person who may clock in may see their own month. That is
-- one fact, not two decisions, and the panel no longer asks.
--
-- The row stays, because the action still describes something real: reading an
-- employee's month, which their employer does on their page. Only its wording
-- was wrong, and a matrix that describes a grant it no longer governs is worse
-- than no matrix.
--
-- `message` is left exactly as it is: writing to your employer is a thing a
-- laboratory may reasonably switch off, and nothing else offers it.
-- ---------------------------------------------------------------------------

UPDATE `permission_actions`
SET `description` = 'Reading an employee''s month. Their own is always theirs — anybody who can punch in can read back what they punched.',
    `updated_at` = NOW()
WHERE `name` = 'attendance';

-- ---------------------------------------------------------------------------
-- Rollback
--
-- UPDATE `permission_actions`
-- SET `description` = 'Their own month: punching in and out, and reading it back.'
-- WHERE `name` = 'attendance';
-- ---------------------------------------------------------------------------
