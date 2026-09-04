-- ---------------------------------------------------------------------------
-- 030 — the columns 023 missed
--
-- 023 turned the four-character string `null` back into SQL NULL on twelve
-- columns of `users` and fixed the write path that produced it. It listed the
-- twelve columns somebody had noticed. Six more were holding the same word and
-- were not on the list, so they are still holding it: `email`, `address`,
-- `city`, `state`, `pincode` and `profile_photo`.
--
-- They show up as the word "null" typed into the boxes on the Edit Employee
-- form, which is how this was found — and `profile_photo` is a file path, so a
-- row holding "null" asks the panel for a file called `null` and renders a
-- broken photograph on an account that never had one.
--
-- Written against every text column on the table rather than a list this time.
-- A list is what left six behind: the next column somebody adds is not on it
-- either, and there is no column of `users` where the bare word "null" is a
-- value anybody meant.
--
-- Only the exact word, and only where it is the whole value: an address on
-- Null Lane, or a name containing it, is left alone. Text columns only —
-- number and date columns cannot hold the word, and asking a DECIMAL whether
-- it equals 'null' is an error rather than a question.
--
-- Not reversible, and does not need to be.
-- ---------------------------------------------------------------------------

UPDATE `users` SET `email`         = NULL WHERE `email`         = 'null';
UPDATE `users` SET `address`       = NULL WHERE `address`       = 'null';
UPDATE `users` SET `city`          = NULL WHERE `city`          = 'null';
UPDATE `users` SET `state`         = NULL WHERE `state`         = 'null';
UPDATE `users` SET `country`       = NULL WHERE `country`       = 'null';
UPDATE `users` SET `pincode`       = NULL WHERE `pincode`       = 'null';
UPDATE `users` SET `profile_photo` = NULL WHERE `profile_photo` = 'null';
UPDATE `users` SET `owner_name`    = NULL WHERE `owner_name`    = 'null';
UPDATE `users` SET `office_tel`    = NULL WHERE `office_tel`    = 'null';
UPDATE `users` SET `account_holder` = NULL WHERE `account_holder` = 'null';
UPDATE `users` SET `account_type`  = NULL WHERE `account_type`  = 'null';
UPDATE `users` SET `bank_branch`   = NULL WHERE `bank_branch`   = 'null';
UPDATE `users` SET `passport_no`   = NULL WHERE `passport_no`   = 'null';
UPDATE `users` SET `dl_no`         = NULL WHERE `dl_no`         = 'null';
UPDATE `users` SET `voter_id`      = NULL WHERE `voter_id`      = 'null';
UPDATE `users` SET `pan_photo`     = NULL WHERE `pan_photo`     = 'null';
UPDATE `users` SET `passport_photo` = NULL WHERE `passport_photo` = 'null';
UPDATE `users` SET `dl_photo`      = NULL WHERE `dl_photo`      = 'null';
UPDATE `users` SET `voter_photo`   = NULL WHERE `voter_photo`   = 'null';
UPDATE `users` SET `id_proof_type` = NULL WHERE `id_proof_type` = 'null';
UPDATE `users` SET `address_proof_type` = NULL WHERE `address_proof_type` = 'null';
-- `registration_fee` is left out on purpose: it is a DECIMAL column, and
-- comparing one to the string 'null' is an error in strict mode rather than a
-- comparison that finds nothing. A number column cannot hold the word anyway.

-- `npm run check:nulls` is the standing version of this: it sweeps every text
-- column of every table and reports any that hold the word. Run it after
-- anything writes through the panel in bulk.
-- ---------------------------------------------------------------------------
