-- ---------------------------------------------------------------------------
-- 026 — one list of proofs, each with its own scan
--
-- Migration 024 gave the franchisee form two questions, `id_proof_type` and
-- `address_proof_type`, because the paper asks them in two boxes. In practice
-- they are one question asked twice: an Aadhaar card is identity proof and
-- address proof, and a franchise hands over two or three documents that
-- between them answer both. Two single-choice columns made somebody pick one
-- document per box and leave the third unrecorded.
--
-- So there is one list. `id_proof_type` holds the documents produced, comma
-- separated — "PAN,AADHAR,VOTER ID" — which needs more than the 20 characters
-- it was given. The printed form still prints both rows of tick boxes; both
-- read from this one list, so an Aadhaar ticks in both places, which is what
-- somebody filling the paper by hand does anyway.
--
-- `address_proof_type` is dropped rather than left in place. It is one day
-- old, no row has ever held a value in it (checked, not assumed), and a column
-- nothing writes is a column the next person has to work out the meaning of.
--
-- Three photo columns join `pan_photo` and `adhar_photo`, which already
-- existed: a proof recorded without its scan is a claim, and every one of the
-- five now has somewhere to keep the copy that was handed over.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  MODIFY COLUMN `id_proof_type` VARCHAR(120) NULL DEFAULT NULL,
  ADD COLUMN `passport_photo` VARCHAR(255) NULL DEFAULT NULL AFTER `passport_no`,
  ADD COLUMN `dl_photo`       VARCHAR(255) NULL DEFAULT NULL AFTER `dl_no`,
  ADD COLUMN `voter_photo`    VARCHAR(255) NULL DEFAULT NULL AFTER `voter_id`,
  DROP COLUMN `address_proof_type`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users`
--   MODIFY COLUMN `id_proof_type` VARCHAR(20) NULL DEFAULT NULL,
--   ADD COLUMN `address_proof_type` VARCHAR(20) NULL DEFAULT NULL AFTER `id_proof_type`,
--   DROP COLUMN `passport_photo`,
--   DROP COLUMN `dl_photo`,
--   DROP COLUMN `voter_photo`;
--
-- Narrowing `id_proof_type` back to 20 characters truncates any list longer
-- than one document. Read the column out first.
-- ---------------------------------------------------------------------------
