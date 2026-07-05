CREATE TYPE "public"."game_type" AS ENUM('video', 'ttrpg', 'boardgame');--> statement-breakpoint
CREATE TYPE "public"."tabletop_format" AS ENUM('virtual', 'in_person', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."ttrpg_length_band" AS ENUM('one_shot', 'arc', 'mini_campaign', 'campaign');--> statement-breakpoint
CREATE TABLE "tabletop_details" (
	"game_id" uuid PRIMARY KEY NOT NULL,
	"system" text,
	"format" "tabletop_format",
	"platform" text,
	"gm_user_id" text,
	"min_players" smallint,
	"max_players" smallint,
	"length_band" "ttrpg_length_band",
	"playtime_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "game_type" "game_type" DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "tabletop_details" ADD CONSTRAINT "tabletop_details_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabletop_details" ADD CONSTRAINT "tabletop_details_gm_user_id_user_id_fk" FOREIGN KEY ("gm_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;