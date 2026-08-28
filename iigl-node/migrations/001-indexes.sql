-- ---------------------------------------------------------------------------
-- 001 — indexes
--
-- Audit finding H1. The database carries no index but the primary key on any
-- table, so every laboratory-scoped query is a full table scan: 22,103 rows for
-- a certificate list, 9,608 for an order list. The cost grows with the archive
-- rather than with the working set, which is why it will be felt on the day of
-- cutover rather than now.
--
-- Every statement here is additive and reversible. No column changes type, no
-- row changes value, and nothing is dropped. The rollback is at the bottom.
--
-- Safe to run against a database the Laravel application is still serving:
-- InnoDB builds these online, and neither application reads an index by name.
--
-- Run it once. Re-running reports "Duplicate key name" per statement and
-- changes nothing.
--
--   mysql -u root -p iigl < migrations/001-indexes.sql
-- ---------------------------------------------------------------------------

-- reports: the largest table, and the one every lab query filters.
CREATE INDEX idx_reports_lab             ON reports (lab_id);
CREATE INDEX idx_reports_order_detail    ON reports (order_detail_id);
CREATE INDEX idx_reports_report_no       ON reports (report_no);
CREATE INDEX idx_reports_order_no        ON reports (order_no);
CREATE INDEX idx_reports_lab_created     ON reports (lab_id, created_at);

-- orders: lists, dashboard tiles, and the collision check on create.
CREATE INDEX idx_orders_lab_status       ON orders (lab_id, status);
CREATE INDEX idx_orders_order_no         ON orders (order_no);
CREATE INDEX idx_orders_order_date       ON orders (order_date);
CREATE INDEX idx_orders_mobile           ON orders (mobile);
CREATE INDEX idx_orders_received_by      ON orders (received_by);
CREATE INDEX idx_orders_assigned_to      ON orders (assigned_to);

-- order_details: read for every order, every quote and every card.
CREATE INDEX idx_order_details_order     ON order_details (order_id);

-- transactions: ledger, wallet and approvals.
CREATE INDEX idx_transactions_send       ON transactions (send_by);
CREATE INDEX idx_transactions_received   ON transactions (received_by);
CREATE INDEX idx_transactions_order      ON transactions (order_id);
CREATE INDEX idx_transactions_type       ON transactions (transaction_type, status);

-- users: sign-in looks up by mobile on every attempt.
CREATE INDEX idx_users_mobile            ON users (mobile);
CREATE INDEX idx_users_role              ON users (role_id);

-- employements: resolves the laboratory for every staff request.
CREATE INDEX idx_employements_user       ON employements (user_id, is_working);
CREATE INDEX idx_employements_parent     ON employements (parent_id, is_working);

-- attributes and their values: read on every certificate form and every card.
CREATE INDEX idx_attributes_subcategory  ON attributes (subcategory_id, is_deleted);
CREATE INDEX idx_attribute_values_attr   ON attribute_values (attr_id, is_deleted);

-- prices: the band lookup behind every quote.
CREATE INDEX idx_prices_category_lab     ON prices (category_id, lab_id);

-- subcategories: listed per category throughout.
CREATE INDEX idx_subcategories_category  ON subcategories (category_id);

-- attendances: one lookup per person per day.
CREATE INDEX idx_attendances_emp_date    ON attendances (empId, date);

-- Public lookups. The certificate verification path is the one an outside
-- visitor hits, so it should not scan.
CREATE INDEX idx_reportsearches_report   ON reportsearches (report_no);
CREATE INDEX idx_blogs_slug              ON blogs (slug);
CREATE INDEX idx_branches_pageurl        ON branches (pageURL);
CREATE INDEX idx_websites_page_type      ON websites (page_type);
CREATE INDEX idx_banners_type_status     ON banners (img_type, status);

-- role_permissions: read on every staff request that is scoped by role.
CREATE INDEX idx_role_permissions_role   ON role_permissions (role_id, action_type);

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP INDEX idx_reports_lab             ON reports;
-- DROP INDEX idx_reports_order_detail    ON reports;
-- DROP INDEX idx_reports_report_no       ON reports;
-- DROP INDEX idx_reports_order_no        ON reports;
-- DROP INDEX idx_reports_lab_created     ON reports;
-- DROP INDEX idx_orders_lab_status       ON orders;
-- DROP INDEX idx_orders_order_no         ON orders;
-- DROP INDEX idx_orders_order_date       ON orders;
-- DROP INDEX idx_orders_mobile           ON orders;
-- DROP INDEX idx_orders_received_by      ON orders;
-- DROP INDEX idx_orders_assigned_to      ON orders;
-- DROP INDEX idx_order_details_order     ON order_details;
-- DROP INDEX idx_transactions_send       ON transactions;
-- DROP INDEX idx_transactions_received   ON transactions;
-- DROP INDEX idx_transactions_order      ON transactions;
-- DROP INDEX idx_transactions_type       ON transactions;
-- DROP INDEX idx_users_mobile            ON users;
-- DROP INDEX idx_users_role              ON users;
-- DROP INDEX idx_employements_user       ON employements;
-- DROP INDEX idx_employements_parent     ON employements;
-- DROP INDEX idx_attributes_subcategory  ON attributes;
-- DROP INDEX idx_attribute_values_attr   ON attribute_values;
-- DROP INDEX idx_prices_category_lab     ON prices;
-- DROP INDEX idx_subcategories_category  ON subcategories;
-- DROP INDEX idx_attendances_emp_date    ON attendances;
-- DROP INDEX idx_reportsearches_report   ON reportsearches;
-- DROP INDEX idx_blogs_slug              ON blogs;
-- DROP INDEX idx_branches_pageurl        ON branches;
-- DROP INDEX idx_websites_page_type      ON websites;
-- DROP INDEX idx_banners_type_status     ON banners;
-- DROP INDEX idx_role_permissions_role   ON role_permissions;
-- ---------------------------------------------------------------------------
