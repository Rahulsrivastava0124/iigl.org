-- ---------------------------------------------------------------------------
-- 061 — the Panel URL setting goes
--
-- A password reset link pointed at one configured Panel URL, which could only
-- ever be one of the three doors: head office and team accounts were mailed a
-- link to the laboratories' sign-in, which refuses them. The link now goes back
-- to the panel the reset was asked from (panelAddressFor in lib/session.ts), so
-- the setting, its PANEL_URL fallback and this stored value are all gone.
--
-- One row: the value only ever named a panel address, and nothing reads it.
-- ---------------------------------------------------------------------------

DELETE FROM `settings` WHERE `key` = 'mail.panel_url';

-- ---------------------------------------------------------------------------
-- Rollback
--
-- Nothing to restore: the setting no longer exists in settings.service.ts, and
-- the address it held is the panel's own.
-- ---------------------------------------------------------------------------
