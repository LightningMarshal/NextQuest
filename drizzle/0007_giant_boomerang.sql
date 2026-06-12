ALTER TABLE "app_settings" ALTER COLUMN "group_name" SET DEFAULT 'Next Quest';--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "quality_weight" real DEFAULT 0.5 NOT NULL;