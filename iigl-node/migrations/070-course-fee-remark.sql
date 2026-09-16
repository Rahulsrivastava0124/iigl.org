-- ---------------------------------------------------------------------------
-- 070 — the backfilled course fees' remark, shortened
--
-- 069 wrote "Course fee — <course> (paid before fees were recorded in the
-- wallet)." on the fees it carried into head office's Wallet. The bracket is
-- dropped: the remark reads "Course fee — <course>." like any other.
-- 069 is applied and checksummed, so the correction is its own file.
-- ---------------------------------------------------------------------------

UPDATE `transactions`
   SET `remark` = REPLACE(`remark`, ' (paid before fees were recorded in the wallet).', '.')
 WHERE `transaction_type` = 'course_fee'
   AND `remark` LIKE '% (paid before fees were recorded in the wallet).';

-- ---------------------------------------------------------------------------
-- Rollback
--
-- Not reversible from the rows alone; the text removed was only a note.
-- ---------------------------------------------------------------------------
