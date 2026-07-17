CREATE TYPE "public"."event_venue" AS ENUM('virtual', 'in_person', 'hybrid');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venue" "event_venue";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "wrap_up_nudge_sent_at" timestamp with time zone;