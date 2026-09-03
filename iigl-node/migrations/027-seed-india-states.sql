-- ---------------------------------------------------------------------------
-- 027 — India and its states, seeded
--
-- 017 created `countries`, `states` and `districts` and seeded none of them:
-- they were left for head office to fill through Master. Nobody did, so the
-- State and Town/City boxes on the laboratory form have been drawing an empty
-- menu — a select with no options reads as a broken field, and the address it
-- is asking for is the one that goes on the franchisee agreement.
--
-- The thirty-six states and union territories are not a list anybody should be
-- typing by hand into Master, and they do not change. Districts are: there are
-- some seven hundred of them, they are argued over, and a laboratory's town is
-- often not one anyway — so those stay empty and the form adds what somebody
-- types.
--
-- Codes are the ISO 3166-2:IN subdivision codes, which is what "WB" already
-- means wherever it was typed into an address years ago.
--
-- Idempotent: every insert is guarded by NOT EXISTS on the name, so running it
-- against a database somebody has already filled adds nothing and changes
-- nothing. Existing rows are left exactly as they are.
-- ---------------------------------------------------------------------------

INSERT INTO `countries` (`name`, `code`, `is_active`, `created_at`, `updated_at`)
SELECT 'India', 'IN', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM `countries` WHERE `name` = 'India');

INSERT INTO `states` (`country_id`, `name`, `code`, `is_active`, `created_at`, `updated_at`)
SELECT c.id, s.name, s.code, 1, NOW(), NOW()
FROM (
  SELECT 'Andhra Pradesh' AS name, 'AP' AS code UNION ALL
  SELECT 'Arunachal Pradesh', 'AR' UNION ALL
  SELECT 'Assam', 'AS' UNION ALL
  SELECT 'Bihar', 'BR' UNION ALL
  SELECT 'Chhattisgarh', 'CG' UNION ALL
  SELECT 'Goa', 'GA' UNION ALL
  SELECT 'Gujarat', 'GJ' UNION ALL
  SELECT 'Haryana', 'HR' UNION ALL
  SELECT 'Himachal Pradesh', 'HP' UNION ALL
  SELECT 'Jharkhand', 'JH' UNION ALL
  SELECT 'Karnataka', 'KA' UNION ALL
  SELECT 'Kerala', 'KL' UNION ALL
  SELECT 'Madhya Pradesh', 'MP' UNION ALL
  SELECT 'Maharashtra', 'MH' UNION ALL
  SELECT 'Manipur', 'MN' UNION ALL
  SELECT 'Meghalaya', 'ML' UNION ALL
  SELECT 'Mizoram', 'MZ' UNION ALL
  SELECT 'Nagaland', 'NL' UNION ALL
  SELECT 'Odisha', 'OD' UNION ALL
  SELECT 'Punjab', 'PB' UNION ALL
  SELECT 'Rajasthan', 'RJ' UNION ALL
  SELECT 'Sikkim', 'SK' UNION ALL
  SELECT 'Tamil Nadu', 'TN' UNION ALL
  SELECT 'Telangana', 'TS' UNION ALL
  SELECT 'Tripura', 'TR' UNION ALL
  SELECT 'Uttar Pradesh', 'UP' UNION ALL
  SELECT 'Uttarakhand', 'UK' UNION ALL
  SELECT 'West Bengal', 'WB' UNION ALL
  -- The eight union territories, on the same list because an address does not
  -- distinguish them and the form asks one question, not two.
  SELECT 'Andaman and Nicobar Islands', 'AN' UNION ALL
  SELECT 'Chandigarh', 'CH' UNION ALL
  SELECT 'Dadra and Nagar Haveli and Daman and Diu', 'DH' UNION ALL
  SELECT 'Delhi', 'DL' UNION ALL
  SELECT 'Jammu and Kashmir', 'JK' UNION ALL
  SELECT 'Ladakh', 'LA' UNION ALL
  SELECT 'Lakshadweep', 'LD' UNION ALL
  SELECT 'Puducherry', 'PY'
) AS s
JOIN `countries` c ON c.name = 'India'
WHERE NOT EXISTS (
  SELECT 1 FROM `states` x WHERE x.country_id = c.id AND x.name = s.name
);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DELETE FROM `states`    WHERE country_id = (SELECT id FROM `countries` WHERE name = 'India');
-- DELETE FROM `countries` WHERE name = 'India';
--
-- Only safe while nothing has been added under them by hand.
-- ---------------------------------------------------------------------------
