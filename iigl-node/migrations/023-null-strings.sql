-- ---------------------------------------------------------------------------
-- 023 — the word "null" is not a value
--
-- Twelve columns on `users` hold the four-character string `null` where they
-- should hold SQL NULL. `PATCH /api/users/me` and the administrator's update
-- both did `String(req.body[key])`, and `String(null)` is the word "null", so
-- a form that sent a JSON null for an empty field wrote it as text. Fixed at
-- the source in the same change as this migration; this cleans what it left.
--
-- It is not only cosmetic. `signature` and `documentation` are file paths, so
-- a row holding "null" asks the panel for `/api/files/null`, which fails and
-- shows as a broken attachment on a laboratory that never had one. `gst_no`
-- and the bank columns print on documents.
--
-- Only the exact string is touched, and only where it is the whole value: a
-- genuine value containing the word — an address on Null Lane — is left alone.
--
-- Not reversible, and does not need to be: there is no reading under which
-- somebody meant to store the word "null" in an IFSC code. The rollback below
-- would put the broken values back and exists only for completeness.
-- ---------------------------------------------------------------------------

UPDATE `users` SET `alt_mobile`   = NULL WHERE `alt_mobile`   = 'null';
UPDATE `users` SET `fax`          = NULL WHERE `fax`          = 'null';
UPDATE `users` SET `gst_no`       = NULL WHERE `gst_no`       = 'null';
UPDATE `users` SET `adhar_no`     = NULL WHERE `adhar_no`     = 'null';
UPDATE `users` SET `pan_no`       = NULL WHERE `pan_no`       = 'null';
UPDATE `users` SET `bank_name`    = NULL WHERE `bank_name`    = 'null';
UPDATE `users` SET `ifsc_code`    = NULL WHERE `ifsc_code`    = 'null';
UPDATE `users` SET `account_no`   = NULL WHERE `account_no`   = 'null';

-- File paths. These are the ones that were showing as broken attachments.
UPDATE `users` SET `adhar_photo`   = NULL WHERE `adhar_photo`   = 'null';
UPDATE `users` SET `company_logo`  = NULL WHERE `company_logo`  = 'null';
UPDATE `users` SET `signature`     = NULL WHERE `signature`     = 'null';
UPDATE `users` SET `documentation` = NULL WHERE `documentation` = 'null';

-- ---------------------------------------------------------------------------
-- Rollback
--
-- There is none worth having: putting the word "null" back into an IFSC code
-- restores a bug, not a value.
-- ---------------------------------------------------------------------------
