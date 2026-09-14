-- ---------------------------------------------------------------------------
-- 055 — which laboratories the website lists as branches
--
-- The website's Branches section is the laboratory network. Not every
-- laboratory account belongs on it: one still being set up, one that has
-- closed, a test account. Head office decides, laboratory by laboratory, from
-- Website Setup › Branches.
--
-- NOT NULL DEFAULT 0: nothing is published until head office ticks it. A
-- laboratory's name and city going onto the public site is a decision, not a
-- side effect of the column arriving.
--
-- Additive. Only role 2 rows read it; on every other user it stays 0 unused.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `show_on_site` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users`
--   DROP COLUMN `show_on_site`;
-- ---------------------------------------------------------------------------
