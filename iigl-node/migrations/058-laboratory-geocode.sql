-- ---------------------------------------------------------------------------
-- 058 — where a laboratory's city is, found rather than typed
--
-- The website's Branches map places each laboratory on its city. Nobody enters
-- coordinates: the API looks the city and state up with a geocoder
-- (geocode.service.ts) and keeps the answer here, so a lookup happens once per
-- city rather than once per visitor.
--
--   geo_latitude    the city's point, or NULL when the geocoder found nothing
--   geo_longitude   (a misspelt city) — the website then uses the state.
--   geo_query       the "city|state" the point was found for. When the
--                   laboratory's city or state is edited this stops matching,
--                   the stored point is ignored, and the city is looked up
--                   again. NULL means never looked up.
--   geo_at          when, so a failed lookup is retried after a while rather
--                   than on every request.
--
-- Additive, all nullable.
-- ---------------------------------------------------------------------------

ALTER TABLE `users`
  ADD COLUMN `geo_latitude` DECIMAL(9,6) NULL AFTER `show_on_site`,
  ADD COLUMN `geo_longitude` DECIMAL(9,6) NULL AFTER `geo_latitude`,
  ADD COLUMN `geo_query` VARCHAR(255) NULL AFTER `geo_longitude`,
  ADD COLUMN `geo_at` DATETIME NULL AFTER `geo_query`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `users`
--   DROP COLUMN `geo_at`,
--   DROP COLUMN `geo_query`,
--   DROP COLUMN `geo_longitude`,
--   DROP COLUMN `geo_latitude`;
-- ---------------------------------------------------------------------------
