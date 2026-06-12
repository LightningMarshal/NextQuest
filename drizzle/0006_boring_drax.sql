CREATE TABLE "game_vote_milestones" (
	"game_id" uuid NOT NULL,
	"milestone" smallint NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_vote_milestones_game_id_milestone_pk" PRIMARY KEY("game_id","milestone")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reminder_24h_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reminder_1h_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_vote_milestones" ADD CONSTRAINT "game_vote_milestones_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;