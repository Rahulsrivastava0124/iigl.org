-- ---------------------------------------------------------------------------
-- 043 — the replies written between 041 and 042
--
-- 041 started sending an approver's sentence back as a message. 042 gave that
-- message a `reply_to` so the inbox could fold it into the request it answers.
-- Anything sent in between has no link and still floats at the top level, which
-- is the thing 042 exists to stop.
--
-- Those rows are identifiable exactly, not guessed at, because 041 wrote both
-- sides in one transaction:
--
--   the reply's `created_at` is the request's `resolved_at`, to the second
--   the two people are the same pair, reversed
--   the `about_date` is copied across
--   the reply is a `message` and answers nothing yet
--
-- All four together. Any one of them alone would be a guess — two people can
-- exchange messages about the same day — and mislinking a reply puts an answer
-- under a question nobody asked.
--
-- Reversible: the column goes back to NULL and the replies return to the list.
-- ---------------------------------------------------------------------------

UPDATE `staff_messages` AS reply
  JOIN `staff_messages` AS request
    ON  request.`kind`        = 'request'
    AND request.`resolved_at` = reply.`created_at`
    AND request.`from_user`   = reply.`to_user`
    AND request.`to_user`     = reply.`from_user`
    AND (
          (request.`about_date` IS NULL AND reply.`about_date` IS NULL)
       OR  request.`about_date` = reply.`about_date`
        )
SET reply.`reply_to` = request.`id`
WHERE reply.`kind` = 'message'
  AND reply.`reply_to` IS NULL;

-- ---------------------------------------------------------------------------
-- Rollback
--
-- UPDATE `staff_messages` SET `reply_to` = NULL WHERE `reply_to` IS NOT NULL;
--
-- Only safe while every link was written by this file or by the resolve route;
-- both mean the same thing, and unlinking loses nothing but the folding.
-- ---------------------------------------------------------------------------
