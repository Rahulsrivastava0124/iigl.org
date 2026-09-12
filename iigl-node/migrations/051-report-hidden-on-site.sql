-- ---------------------------------------------------------------------------
-- 051 — a certificate that is not published
--
-- Every report is verifiable on the public site by its number: a customer types
-- what is printed on the card and gets back what the card says. That is the
-- point of the number, and it stays the default.
--
-- Some are not for publication. A stone re-certified after a correction, a
-- customer who asked for their item not to be lookupable, an internal issue
-- that was never handed over — the record must stay in the laboratory's books
-- and off the public endpoint, which are two different things and until now
-- were the same one.
--
-- A hidden report answers the public endpoint **exactly as a number that was
-- never issued does**: same 404, same wording. An outsider must not be able to
-- tell a withheld certificate from a nonexistent one, because a distinguishable
-- refusal is itself the disclosure that a certificate exists.
--
-- NOT NULL DEFAULT 0: every certificate already issued stays published, which
-- is what it was when it was handed over.
--
-- Additive. 050 is applied and checksummed, so this is a new file rather than
-- an edit to it.
-- ---------------------------------------------------------------------------

ALTER TABLE `reports`
  ADD COLUMN `hidden_on_site` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_approx`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `reports`
--   DROP COLUMN `hidden_on_site`;
-- ---------------------------------------------------------------------------
