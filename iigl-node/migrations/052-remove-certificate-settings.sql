-- ---------------------------------------------------------------------------
-- 052 — the Certificate settings are gone
--
-- Settings › Certificate let head office put a prefix in front of every new
-- certificate number and change how many digits the daily counter is padded
-- to. It has been removed — the screen, the menu entry, the two settings and
-- the code that read them — and new certificates are numbered in the ported
-- twelve-digit form again: laboratory, day, a four-digit counter, year, month.
--
-- The two rows below were the only place those choices were held. Nothing
-- reads them any more, and a row nothing reads is a setting somebody finds
-- later and wonders about, so they are deleted.
--
-- Certificates already issued keep the numbers they were printed with; only
-- new numbers change. Nothing else is touched.
-- ---------------------------------------------------------------------------

DELETE FROM `settings`
WHERE `key` IN ('certificate.prefix', 'certificate.counter_width');

-- ---------------------------------------------------------------------------
-- Rollback
--
-- INSERT INTO `settings` (`key`, `value`, `created_at`, `updated_at`) VALUES
--   ('certificate.prefix', 'iigl', NOW(), NOW()),
--   ('certificate.counter_width', '2', NOW(), NOW());
--
-- The values are the ones stored when this ran. The code that read them has to
-- come back too for them to mean anything.
-- ---------------------------------------------------------------------------
