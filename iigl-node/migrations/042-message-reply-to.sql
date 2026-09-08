-- ---------------------------------------------------------------------------
-- 042 — a reply knows what it answers
--
-- 041 sends the approver's sentence back as an ordinary message, which is right:
-- it reaches the person's inbox rather than sitting on a record they have no
-- reason to reopen. But nothing tied it to the request, so it arrived as its own
-- top-level row — "not Accept" floating above the leave request it refuses,
-- with only a shared date to suggest they are connected.
--
-- One column, holding the request this answers. The panel folds a reply into
-- the row it belongs to instead of listing it beside it, and the inbox stops
-- being a pile of half-sentences.
--
-- NULL is an ordinary message that answers nothing, which is every existing row
-- and most future ones.
--
-- Additive and nullable. Nothing existing is read, written or dropped.
-- ---------------------------------------------------------------------------

ALTER TABLE `staff_messages`
  ADD COLUMN `reply_to` BIGINT UNSIGNED NULL DEFAULT NULL AFTER `about_date`;

-- The inbox asks "what answers these" for every request on the page.
CREATE INDEX `staff_messages_reply_to` ON `staff_messages` (`reply_to`);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP INDEX `staff_messages_reply_to` ON `staff_messages`;
-- ALTER TABLE `staff_messages` DROP COLUMN `reply_to`;
--
-- Replies go back to being ordinary messages in the list, which is where they
-- were before. Nothing is lost but the connection.
-- ---------------------------------------------------------------------------
