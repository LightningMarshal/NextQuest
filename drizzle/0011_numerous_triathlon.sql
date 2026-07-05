ALTER TYPE "public"."metadata_source" ADD VALUE 'bgg' BEFORE 'manual';--> statement-breakpoint
ALTER TABLE "game_metadata" ADD COLUMN "bgg_rating" smallint;--> statement-breakpoint
ALTER TABLE "game_metadata" ADD COLUMN "bgg_weight" numeric(2, 1);--> statement-breakpoint
ALTER TABLE "tabletop_details" ADD COLUMN "bgg_id" integer;--> statement-breakpoint
ALTER TABLE "tabletop_details" ADD CONSTRAINT "tabletop_details_bgg_id_unique" UNIQUE("bgg_id");