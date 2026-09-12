-- ---------------------------------------------------------------------------
-- 050 — the artwork a course certificate is printed on
--
-- A course certificate is a designed sheet: a border, the IIGL mark, whatever
-- the head office has had printed. That design belongs to the course rather
-- than to the certificate, because every student finishing the same course
-- takes away the same sheet with a different name on it.
--
-- So: one path per course, holding an image in `uploads/certificate`. Printing
-- lays the student's name, the certificate number, the course, the grade and
-- the date over it. A course with no artwork cannot be printed, which is
-- deliberate — an invented layout handed to a student is worse than a refusal
-- that says what is missing.
--
-- Nullable with no default: most courses will have nothing here until somebody
-- uploads a design, and a NULL is exactly what "not printable yet" means.
--
-- Additive. 049 is applied and checksummed, so this is a new file rather than
-- an edit to it.
-- ---------------------------------------------------------------------------

ALTER TABLE `courses`
  ADD COLUMN `certificate_template` VARCHAR(255) NULL DEFAULT NULL AFTER `description`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `courses`
--   DROP COLUMN `certificate_template`;
-- ---------------------------------------------------------------------------
