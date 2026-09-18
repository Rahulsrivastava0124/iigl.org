-- ---------------------------------------------------------------------------
-- 075 — laboratories are on the website unless hidden
--
-- 055 made the Branches section opt-in: a laboratory showed on the website
-- only once head office ticked it in Website Setup › Branches. Nobody ever
-- did, so the section — and every pin on its map — has been empty since the
-- website went up, while the old site listed every branch it had.
--
-- The website's Branches section is the laboratory network, so the network is
-- what it shows: the tick is how a laboratory is taken off, the way 060
-- settled the same question for registered customers.
--
-- Every laboratory is switched on, inactive ones included — the public list
-- already refuses those, and a closed branch that reopens should not have to
-- be found and re-ticked. No deliberate "hide" is overwritten: every row is 0
-- and none was ever set by hand.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ALTER COLUMN `show_on_site` SET DEFAULT 1;

UPDATE `users` SET `show_on_site` = 1 WHERE `role_id` = 2;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users` ALTER COLUMN `show_on_site` SET DEFAULT 0;
-- UPDATE `users` SET `show_on_site` = 0 WHERE `role_id` = 2;
-- ---------------------------------------------------------------------------
