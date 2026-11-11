-- Rollback for migration 0022_discord_bot_channels (the Discord bot's
-- channel list). Hand-written and tested, like 0020/0021's.
--
--   psql "$DATABASE_URL" -f drizzle-rollback/0022_discord_bot_channels.down.sql
--
-- Data note: drops the bot channel list and forgets the cards the bot
-- posted (they stay in Discord, just no longer edited). Webhooks and their
-- cards are untouched. Older code never reads this table, so redeploying
-- the previous worker alone is normally enough.

BEGIN;

-- Bot cards are keyed by the channel row's id; webhook cards by a webhook
-- id or 'env'. Remove only the bot's.
DELETE FROM "event_discord_messages"
WHERE "webhook_key" IN (SELECT "id"::text FROM "discord_bot_channels");

DROP TABLE IF EXISTS "discord_bot_channels";

-- Forget the migration so `npm run db:migrate` can re-apply it (the value
-- is idx 22's "when" in drizzle/meta/_journal.json).
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1794275895921;

COMMIT;
