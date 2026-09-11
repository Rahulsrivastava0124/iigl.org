-- ---------------------------------------------------------------------------
-- 046 — what a registered customer wants printed on their certificates
--
-- An order already carries four columns that decide the card: whether the
-- customer's name is printed on it and what that name reads, and whether an
-- image is printed and which file. They are set per order, typed again every
-- time — and for a trade customer they are the same every time, because a
-- jeweller's name and mark on the certificate is the point of registering.
--
-- The same four columns on the customer, under the **same names**, so that a
-- later order for this customer can take them as a straight copy rather than a
-- mapping somebody has to keep in step.
--
-- Additive. 045 is applied and checksummed, so this is a new file rather than
-- an edit to it.
-- ---------------------------------------------------------------------------

ALTER TABLE `registered_customers`
  ADD COLUMN `show_name_in_card`       TINYINT(1)   NOT NULL DEFAULT 0 AFTER `gst_no`,
  ADD COLUMN `show_name_input`         VARCHAR(191) NULL DEFAULT NULL AFTER `show_name_in_card`,
  ADD COLUMN `show_image_in_card`      TINYINT(1)   NOT NULL DEFAULT 0 AFTER `show_name_input`,
  ADD COLUMN `show_image_in_card_file` VARCHAR(255) NULL DEFAULT NULL AFTER `show_image_in_card`;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- ALTER TABLE `registered_customers`
--   DROP COLUMN `show_image_in_card_file`,
--   DROP COLUMN `show_image_in_card`,
--   DROP COLUMN `show_name_input`,
--   DROP COLUMN `show_name_in_card`;
-- ---------------------------------------------------------------------------
