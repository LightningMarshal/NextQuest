-- Rollback for migrations 0020_circle_sessions + 0021_wrapped_up_backfill.
--
-- drizzle-kit has no down migrations, so this is hand-written and tested
-- (docs/deployment/12-redesign-migration.md). Run it ONLY after redeploying
-- the pre-redesign worker (the old code never reads these columns/tables, so
-- it runs fine against the migrated schema — rollback of code alone is
-- usually enough; this script is for fully restoring the old schema).
--
--   psql "$DATABASE_URL" -f drizzle-rollback/0020_0021_circle_sessions.down.sql
--
-- Data note: this DROPS the redesign's own data (invites, applications,
-- webhooks, keen flags, Discord message ids, session visibility/capacity).
-- Pre-redesign data is untouched. Take an export first.

BEGIN;

-- Guests become pending again: the old app has no guest tier, and pending
-- is its safe "no access" state. Postgres cannot drop an enum value, so
-- 'guest' stays in user_role, unused.
UPDATE "user" SET "role" = 'member', "status" = 'pending' WHERE "role" = 'guest';

DROP INDEX IF EXISTS "events_status_scheduled_idx";
DROP INDEX IF EXISTS "event_attendance_user_idx";

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_wrapped_up_by_user_id_fk";
ALTER TABLE "events"
	DROP COLUMN IF EXISTS "visibility",
	DROP COLUMN IF EXISTS "capacity",
	DROP COLUMN IF EXISTS "join_url",
	DROP COLUMN IF EXISTS "wrapped_up_at",
	DROP COLUMN IF EXISTS "wrapped_up_by",
	DROP COLUMN IF EXISTS "auto_closed";
ALTER TABLE "user" DROP COLUMN IF EXISTS "calendar_feed_version";

DROP TABLE IF EXISTS "game_interest";
DROP TABLE IF EXISTS "event_discord_messages";
DROP TABLE IF EXISTS "membership_applications";
DROP TABLE IF EXISTS "invite_redemptions";
DROP TABLE IF EXISTS "invites";
DROP TABLE IF EXISTS "discord_webhooks";

DROP TYPE IF EXISTS "event_visibility";
DROP TYPE IF EXISTS "webhook_audience";
DROP TYPE IF EXISTS "application_status";

-- Forget the two migrations so `npm run db:migrate` can re-apply them.
-- drizzle records each migration by its journal "when" (created_at); these
-- are the values in drizzle/meta/_journal.json for idx 20 and 21.
DELETE FROM "drizzle"."__drizzle_migrations"
WHERE "created_at" IN (1790456368863, 1790456388408);

COMMIT;
