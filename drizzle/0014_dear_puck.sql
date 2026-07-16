ALTER TABLE "user" ADD COLUMN "tutorial_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "session_number" integer;