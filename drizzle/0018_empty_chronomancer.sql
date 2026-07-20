CREATE TYPE "public"."poll_kind" AS ENUM('slots', 'grid');--> statement-breakpoint
CREATE TABLE "availability_marks" (
	"poll_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_marks_poll_id_user_id_starts_at_pk" PRIMARY KEY("poll_id","user_id","starts_at")
);
--> statement-breakpoint
ALTER TABLE "availability_polls" ADD COLUMN "kind" "poll_kind" DEFAULT 'slots' NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_polls" ADD COLUMN "grid_session_minutes" smallint;--> statement-breakpoint
ALTER TABLE "availability_marks" ADD CONSTRAINT "availability_marks_poll_id_availability_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."availability_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_marks" ADD CONSTRAINT "availability_marks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;