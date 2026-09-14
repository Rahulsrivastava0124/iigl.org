-- ---------------------------------------------------------------------------
-- 054 — a file on a message
--
-- The chat can carry a photograph or a PDF: a medical certificate with a leave
-- request, a bill, a scan somebody was asked for. One file per message, as a
-- path in uploads/message, the same way every other upload is attached to the
-- row that owns it.
--
-- Nullable with no default: every message written before this has no file,
-- and a NULL is exactly that.
--
-- Additive. 053 is applied and checksummed, so this is a new file rather than
-- an edit to it.
-- ---------------------------------------------------------------------------

ALTER TABLE `staff_messages`
  ADD COLUMN `attachment` VARCHAR(255) NULL DEFAULT NULL AFTER `body`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `staff_messages`
--   DROP COLUMN `attachment`;
-- ---------------------------------------------------------------------------
