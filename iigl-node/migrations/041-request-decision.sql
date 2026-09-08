-- ---------------------------------------------------------------------------
-- 041 — a request is approved or declined, not merely "dealt with"
--
-- `resolved_at` was the whole of a request's state, and the panel could only
-- say "Dealt with" — which does not answer the one question the person who
-- asked has: **did I get the day off?** Approved and declined are the same row
-- with the same timestamp, and somebody reading their own inbox cannot tell
-- which happened to them.
--
-- One column holding the answer. NULL alongside a set `resolved_at` is a
-- request closed before there was a decision to record — the existing rows —
-- and the panel keeps saying "Dealt with" for exactly those, which is all
-- anybody knows about them.
--
-- The reply itself is not a column: it is a message, written back to whoever
-- asked, in the table that already holds messages. A note that lives only on
-- the row it answers is a note nobody is told about.
--
-- Additive and nullable. Nothing existing is read, written or dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `staff_messages`
  ADD COLUMN `decision` VARCHAR(10) NULL DEFAULT NULL AFTER `resolved_by`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `staff_messages` DROP COLUMN `decision`;
--
-- Every request goes back to reading "Dealt with". The replies stay: they are
-- ordinary messages and do not depend on this column.
-- ---------------------------------------------------------------------------
