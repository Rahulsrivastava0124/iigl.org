-- ---------------------------------------------------------------------------
-- 071 — one more document slot on a student
--
-- students.extra_doc — anything the other three slots do not name: a transfer
-- letter, an experience certificate, a second ID. A path in uploads, like
-- photo, id_proof and qualification_doc beside it.
--
-- One nullable column; no existing value changes.
-- ---------------------------------------------------------------------------

ALTER TABLE `students` ADD COLUMN `extra_doc` VARCHAR(255) NULL DEFAULT NULL AFTER `qualification_doc`;
