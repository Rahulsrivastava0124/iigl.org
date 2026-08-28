-- ---------------------------------------------------------------------------
-- 002 — unique constraints
--
-- NOT YET RUNNABLE. Both constraints are blocked by data that already violates
-- them, and resolving that data is a business decision rather than a technical
-- one. Run the preconditions first; each must return zero.
--
-- Until these exist, the application-level checks in the API are the only thing
-- preventing a duplicate, and an application check cannot win a race.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- PRECONDITION 1 — certificate numbers
--
-- Must return zero rows before the constraint below can be created.
-- ---------------------------------------------------------------------------

SELECT report_no, COUNT(*) AS issued, GROUP_CONCAT(id) AS report_ids
FROM reports
GROUP BY report_no
HAVING issued > 1;

-- Currently returns one row:
--
--   043100002110  ·  reports 399 and 400
--     399 — order 24, item 26, 2.320 / 0.32, lab 4, 2021-11-01 09:54:06
--     400 — order 11, item 12, 1.20  / 0.23, lab 4, 2021-11-01 09:55:27
--
-- Two different stones carry the same number and both certificates are in
-- circulation. A certificate is a document of record, so this cannot be fixed
-- by renumbering one at will — someone has to decide which is reissued and
-- whether the customer is told.
--
-- Once resolved:
--
--   ALTER TABLE reports ADD CONSTRAINT uq_reports_report_no UNIQUE (report_no);
--
-- That replaces the retry loop in createReport as the real guarantee. The loop
-- stays as the friendly path; the constraint is what makes a duplicate
-- impossible rather than unlikely.


-- ---------------------------------------------------------------------------
-- PRECONDITION 2 — mobile numbers
--
-- Must return zero rows before the constraint below can be created.
-- ---------------------------------------------------------------------------

SELECT mobile, COUNT(*) AS accounts, GROUP_CONCAT(CONCAT(id, ' ', fullname) SEPARATOR ' | ') AS who
FROM users
GROUP BY mobile
HAVING accounts > 1;

-- Currently returns three rows:
--
--   8420126860  ·  4 IIGL-KOLKATTA (laboratory)      | 23 Sanjoy Naskar (staff, active)
--   9474797199  ·  5 IIGL-MALDA (laboratory, off)    |  7 MOSHMI SHARMA (staff, active)
--   9851562223  ·  15 Mintu Sarkar (inactive)        | 19 Mintu Sarkar (staff, active)
--
-- Sign-in now resolves by password, so nobody is locked out. But the column is
-- the sign-in identifier and two accounts sharing one is what caused the
-- lockout in the first place.
--
-- Someone has to say which account keeps each number. The other needs a
-- different number, or to be deactivated if it is genuinely dead — laboratory 5
-- and user 15 are both already inactive, which suggests they may be.
--
-- Once resolved:
--
--   ALTER TABLE users ADD CONSTRAINT uq_users_mobile UNIQUE (mobile);
--
-- That also makes the duplicate check in POST /api/users a real guarantee
-- rather than a check that a race can slip past.


-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE reports DROP INDEX uq_reports_report_no;
-- ALTER TABLE users   DROP INDEX uq_users_mobile;
-- ---------------------------------------------------------------------------
