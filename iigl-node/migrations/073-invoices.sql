-- ---------------------------------------------------------------------------
-- 073 — purchase and sales invoices
--
-- Two plain ledgers a laboratory (or head office) keeps of what it bought and
-- what it sold, entered by hand on the Invoice screen. Each row is one line:
-- who it was with, what it was, the tax number, the date, how many, the rate,
-- how it was paid, and the total the quantity and rate come to.
--
--   lab_id          the account that recorded it — whose wallet a purchase
--                   comes out of, and whose books the row belongs to.
--   party_name      the supplier on a purchase, the customer on a sale.
--   transaction_id  the wallet movement a purchase wrote (an `expense` in
--                   `transactions`), so the money leaving is on the account.
--                   NULL on a sale, which does not touch the wallet here.
--
-- Additive.
-- ---------------------------------------------------------------------------

CREATE TABLE `purchases` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lab_id`         INT           NOT NULL,
  `party_name`     VARCHAR(190)  NOT NULL,
  `product_name`   VARCHAR(190)  NOT NULL,
  `gst_no`         VARCHAR(20)   NULL DEFAULT NULL,
  `invoice_date`   DATE          NOT NULL,
  `quantity`       DECIMAL(12,2) NOT NULL DEFAULT 0,
  `rate`           DECIMAL(12,2) NOT NULL DEFAULT 0,
  `amount`         DECIMAL(12,2) NOT NULL DEFAULT 0,
  `payment_method` VARCHAR(40)   NULL DEFAULT NULL,
  `transaction_id` BIGINT        NULL DEFAULT NULL,
  `created_by`     INT           NULL DEFAULT NULL,
  `created_at`     DATETIME      NULL DEFAULT NULL,
  `updated_at`     DATETIME      NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `purchases_lab` (`lab_id`),
  KEY `purchases_date` (`invoice_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sales` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lab_id`         INT           NOT NULL,
  `party_name`     VARCHAR(190)  NOT NULL,
  `product_name`   VARCHAR(190)  NOT NULL,
  `gst_no`         VARCHAR(20)   NULL DEFAULT NULL,
  `invoice_date`   DATE          NOT NULL,
  `quantity`       DECIMAL(12,2) NOT NULL DEFAULT 0,
  `rate`           DECIMAL(12,2) NOT NULL DEFAULT 0,
  `amount`         DECIMAL(12,2) NOT NULL DEFAULT 0,
  `payment_method` VARCHAR(40)   NULL DEFAULT NULL,
  `transaction_id` BIGINT        NULL DEFAULT NULL,
  `created_by`     INT           NULL DEFAULT NULL,
  `created_at`     DATETIME      NULL DEFAULT NULL,
  `updated_at`     DATETIME      NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sales_lab` (`lab_id`),
  KEY `sales_date` (`invoice_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE `sales`;
-- DROP TABLE `purchases`;
