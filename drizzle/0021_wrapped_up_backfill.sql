-- Custom SQL migration file, put your code below! --
-- Completed sessions from before wrap-up receipts existed: their updated_at
-- was stamped by the wrap-up write (a completed event is otherwise
-- immutable), so it is the best available wrap-up time. Conservative: only
-- completed rows, only where the new column is still null.
UPDATE "events"
SET "wrapped_up_at" = "updated_at"
WHERE "status" = 'completed'
  AND "wrapped_up_at" IS NULL;
