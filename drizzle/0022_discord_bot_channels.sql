CREATE TABLE "discord_bot_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel_id" text NOT NULL,
	"audience" "webhook_audience" DEFAULT 'all' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_bot_channels_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
ALTER TABLE "discord_bot_channels" ADD CONSTRAINT "discord_bot_channels_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;