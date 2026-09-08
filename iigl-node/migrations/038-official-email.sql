-- ---------------------------------------------------------------------------
-- 038 — the laboratory's own email address
--
-- `users.email` is the address the account signs in with and the one a password
-- reset is sent to. On a laboratory that address belongs to the **owner**: it
-- is a person's mailbox, and it is the mailbox somebody has to reach to get
-- back into the account.
--
-- The franchise also has an address of its own — the one printed on paper, the
-- one a customer writes to, often a shared inbox two or three people read. The
-- form had one box and asked for both, so whichever was typed, the other was
-- lost, and a laboratory whose office inbox was entered could not have its
-- password reset to anywhere a person actually reads.
--
-- One column, so the two questions have two answers. `email` keeps its meaning
-- exactly — nothing moves, nothing is copied across, and sign-in and reset are
-- untouched.
--
-- Additive and nullable: every existing row is already correct, because every
-- existing row's `email` is the address the account signs in with.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `official_email` VARCHAR(255) NULL DEFAULT NULL AFTER `email`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users` DROP COLUMN `official_email`;
--
-- Read the column out first. Nothing else holds these addresses — `email` is
-- the owner's and is not a copy of them.
-- ---------------------------------------------------------------------------
