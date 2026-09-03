-- ---------------------------------------------------------------------------
-- 022 — a reset names the account it is for
--
-- `password_resets` is Laravel's table and is keyed by email alone. That was
-- workable while an address named one person, and `users.email` has never
-- carried a unique constraint: `rahulhomepoint@gmail.com` is on two active
-- accounts right now.
--
-- The consequence was a dead end. A reset could be *asked for* by mobile
-- number, which identifies one account exactly, and the mail went out — but
-- finishing it looked the account up by email again, found two, and refused.
-- The link could never be used by the person it was sent to.
--
-- So the row records which account it was issued for. The token still proves
-- the mail was received; `user_id` says whose password it opens, decided at
-- the moment the request was made and by the identifier that was actually
-- given.
--
-- Nullable, and no backfill: a row written before this cannot say whose it is,
-- and guessing would be picking one of two people's passwords to overwrite.
-- Those fall back to the old behaviour — resolve by email, refuse if it is
-- ambiguous — and expire within the hour anyway.
--
-- Additive. No existing column changes and nothing is dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `password_resets`
  ADD COLUMN `user_id` bigint unsigned DEFAULT NULL AFTER `email`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `password_resets` DROP COLUMN `user_id`;
-- ---------------------------------------------------------------------------
