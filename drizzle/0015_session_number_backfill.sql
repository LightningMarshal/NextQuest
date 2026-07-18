-- Custom SQL migration file, put your code below! --

-- Backfill events.session_number from the trailing number the clone-forward
-- convention has been keeping in titles ("Session 12" / "Game Night 5").
-- One-time and deliberately conservative: only rows whose title ends in
-- digits, and only where the column is still null.
UPDATE "events"
SET "session_number" = (regexp_match("title", '(\d+)\s*$'))[1]::int
WHERE "session_number" IS NULL
  AND "title" ~ '\d+\s*$';
