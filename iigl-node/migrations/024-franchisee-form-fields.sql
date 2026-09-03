-- ---------------------------------------------------------------------------
-- 024 — the rest of the franchisee form
--
-- The printed registration form asks for seven things the `users` table has no
-- room for, so every one of them was left blank on a form otherwise filled
-- from the record, and somebody wrote them in by hand at the counter:
--
--   ID PROOF          PAN / AADHAR / PASSPORT
--   ADDRESS PROOF     AADHAR / D.L.NO. / VOTER ID
--   OFFICE TEL NO.    with its STD code, which is not the alternate mobile
--   ACCOUNTHOLDER'S NAME  often not the owner — a firm's account, a spouse
--   A/C TYPE          SAVING / CURRENT
--   BRANCH            the bank's, which IFSC implies but does not print
--   FRANCHISEE REGISTRATION FEE
--
-- All nullable, none backfilled: every existing laboratory genuinely has no
-- recorded answer, and inventing one — assuming the accountholder is the
-- owner, assuming SAVING — would print a claim about somebody's bank account
-- that nobody made. The form falls back to the owner's name where it always
-- did, and the ticks print empty until an answer is entered.
--
-- The two proof columns hold the choice, not the document: the scans have
-- their own columns already (`adhar_photo`, `pan_photo`, `documentation`).
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `office_tel`         VARCHAR(30)   NULL DEFAULT NULL AFTER `alt_mobile`,
  ADD COLUMN `id_proof_type`      VARCHAR(20)   NULL DEFAULT NULL AFTER `pan_no`,
  ADD COLUMN `address_proof_type` VARCHAR(20)   NULL DEFAULT NULL AFTER `id_proof_type`,
  ADD COLUMN `account_holder`     VARCHAR(191)  NULL DEFAULT NULL AFTER `bank_name`,
  ADD COLUMN `bank_branch`        VARCHAR(191)  NULL DEFAULT NULL AFTER `account_holder`,
  ADD COLUMN `account_type`       VARCHAR(10)   NULL DEFAULT NULL AFTER `account_no`,
  ADD COLUMN `registration_fee`   DECIMAL(10,2) NULL DEFAULT NULL AFTER `commision`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users`
--   DROP COLUMN `office_tel`,
--   DROP COLUMN `id_proof_type`,
--   DROP COLUMN `address_proof_type`,
--   DROP COLUMN `account_holder`,
--   DROP COLUMN `bank_branch`,
--   DROP COLUMN `account_type`,
--   DROP COLUMN `registration_fee`;
-- ---------------------------------------------------------------------------
