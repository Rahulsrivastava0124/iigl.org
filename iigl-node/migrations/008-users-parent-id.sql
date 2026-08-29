-- ---------------------------------------------------------------------------
-- 008 — `users.parent_id`
--
-- Who a person works for, on the person's own row: a laboratory's user id for a
-- team member, and NULL for a laboratory or for head office, which work for
-- nobody.
--
-- ## This is a second copy of something the database already knows
--
-- `employements.parent_id` already answers it, and that table is the **record
-- of employment**: it carries the joining date, the salary, the leave date and
-- one row per posting, so somebody who moves between laboratories has a
-- history. This column is not a replacement for that and must not become one.
--
-- What it is: the *current* employer, denormalised onto the user, so that
-- answering "whose staff is this" costs no join — on sign-in, in a scope check,
-- in a list.
--
-- The price is the usual price of a second copy: **two places that can
-- disagree**. Three things keep them together, and all three matter:
--
--   1. this migration backfills from the working employment, so they start
--      identical;
--   2. every endpoint that changes an employment writes both, in one place —
--      `setEmployer()` in `user.routes.ts`;
--   3. `npm run check:parents` compares the two and prints any row where they
--      differ. Run it after anything touches `employements` from outside this
--      API — which the Laravel application still does until cutover, and it
--      knows nothing about this column.
--
-- Additive: one nullable column and an index. No existing row changes meaning,
-- and nothing reads it until the API is deployed alongside.
--
--   npm run migrate
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `parent_id` bigint unsigned DEFAULT NULL AFTER `role_id`,
  ADD KEY `users_parent_id_index` (`parent_id`);

-- Backfilled from the current posting only. A person with no working
-- employment — head office, a laboratory, or somebody who has left — keeps
-- NULL, which is the honest answer rather than their last employer.
UPDATE `users` u
  JOIN `employements` e
    ON e.user_id = u.id
   AND e.is_working = '1'
   SET u.parent_id = e.parent_id,
       u.updated_at = u.updated_at;

-- ---------------------------------------------------------------------------
-- Rollback
--
--   ALTER TABLE `users` DROP KEY `users_parent_id_index`, DROP COLUMN `parent_id`;
--
-- Nothing is lost by dropping it: `employements` still holds every posting, and
-- `resolveLabId()` falls back to that table whenever this column is NULL.
-- ---------------------------------------------------------------------------
