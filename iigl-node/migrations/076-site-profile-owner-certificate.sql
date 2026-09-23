-- ---------------------------------------------------------------------------
-- 076 — owner details and a certificate on a branch's website page
--
-- A laboratory sets its own branch page in Settings › Website. These add the
-- owner shown on that page and an uploaded accreditation certificate:
--
--   site_profiles.owner_name    — the person's name, printed beside the branch
--   site_profiles.owner_photo   — their photograph, an uploads path like banner
--   site_profiles.certificate   — an uploaded certificate (image or PDF), path
--
-- Three nullable columns; no existing value changes. A page that has set none
-- of them reads exactly as it did.
-- ---------------------------------------------------------------------------

ALTER TABLE `site_profiles`
  ADD COLUMN `owner_name`  VARCHAR(255) NULL DEFAULT NULL AFTER `content`,
  ADD COLUMN `owner_photo` VARCHAR(255) NULL DEFAULT NULL AFTER `owner_name`,
  ADD COLUMN `certificate` VARCHAR(255) NULL DEFAULT NULL AFTER `owner_photo`;
