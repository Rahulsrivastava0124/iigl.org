-- ---------------------------------------------------------------------------
-- 068 — how an online payment was made, on the payment itself
--
-- Commission paid through Cashfree was written with pay mode `online`, which
-- says the money came through the gateway but not how the laboratory paid it.
-- Cashfree reports the method (UPI, debit card, netbanking…), kept on
-- `payment_orders.payment_method`. From now on the remittance's pay mode is
-- `online_<method>` — `online_upi`, `online_debit_card` — and the panel shows
-- "Online (Debit card)". This brings the ones already paid into line.
--
-- Only rows written by a Cashfree payment, matched through the order that
-- made them; nothing typed by hand is touched.
-- ---------------------------------------------------------------------------

UPDATE `transactions` t
  JOIN `payment_orders` p ON p.`reference_id` = t.`id` AND p.`purpose` = 'commission'
   SET t.`pay_mode` = CONCAT('online_', p.`payment_method`)
 WHERE t.`pay_mode` = 'online'
   AND p.`payment_method` IS NOT NULL
   AND p.`payment_method` <> '';

-- ---------------------------------------------------------------------------
-- Rollback
--
-- UPDATE `transactions` SET `pay_mode` = 'online' WHERE `pay_mode` LIKE 'online_%';
-- ---------------------------------------------------------------------------
