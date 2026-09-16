-- ---------------------------------------------------------------------------
-- 067 — payments taken through the gateway (Cashfree)
--
-- One row per attempt to take money online: a laboratory paying its
-- commission, or a student paying the course fee as they register. The row is
-- written before the payer is sent to the gateway and settled after, so an
-- attempt that is abandoned, fails or is paid twice over is on record either
-- way.
--
--   order_id        ours, sent to Cashfree and unique there — how a callback
--                   finds its row.
--   purpose         'commission' | 'student_registration'
--   status          created → paid | failed | expired. `paid` only ever from
--                   Cashfree's own answer, never from the browser.
--   mode            'sandbox' or 'production', as configured when it was made:
--                   a test payment must never read as money received.
--   payer_id        the account that paid (a laboratory), or NULL for a
--                   student paying from the website.
--   payload         what to do once paid: the registration form, as JSON.
--   fulfilled_at    set once the thing paid for exists — the commission row,
--                   the student and enrolment — so a second callback for the
--                   same payment does nothing. `reference_id` points at it.
--
-- Additive.
-- ---------------------------------------------------------------------------

CREATE TABLE `payment_orders` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`            VARCHAR(45)  NOT NULL,
  `purpose`             VARCHAR(40)  NOT NULL,
  `mode`                VARCHAR(12)  NOT NULL DEFAULT 'sandbox',
  `amount`              DECIMAL(12,2) NOT NULL,
  `currency`            CHAR(3)      NOT NULL DEFAULT 'INR',
  `status`              VARCHAR(16)  NOT NULL DEFAULT 'created',
  `payer_id`            INT          NULL DEFAULT NULL,
  `customer_name`       VARCHAR(150) NULL DEFAULT NULL,
  `customer_phone`      VARCHAR(20)  NULL DEFAULT NULL,
  `customer_email`      VARCHAR(150) NULL DEFAULT NULL,
  `payload`             JSON         NULL,
  `cf_order_id`         VARCHAR(40)  NULL DEFAULT NULL,
  `payment_session_id`  VARCHAR(255) NULL DEFAULT NULL,
  `cf_payment_id`       VARCHAR(40)  NULL DEFAULT NULL,
  `payment_method`      VARCHAR(40)  NULL DEFAULT NULL,
  `reference_id`        BIGINT       NULL DEFAULT NULL,
  `result`              JSON         NULL,
  `created_by`          INT          NULL DEFAULT NULL,
  `paid_at`             DATETIME     NULL DEFAULT NULL,
  `fulfilled_at`        DATETIME     NULL DEFAULT NULL,
  `created_at`          DATETIME     NULL DEFAULT NULL,
  `updated_at`          DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_orders_order_id` (`order_id`),
  KEY `payment_orders_purpose_status` (`purpose`, `status`),
  KEY `payment_orders_payer` (`payer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- DROP TABLE `payment_orders`;
-- ---------------------------------------------------------------------------
