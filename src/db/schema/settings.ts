import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, real, smallint, text, timestamp } from "drizzle-orm/pg-core";

import {
	DEFAULT_DIFFICULTY_MULTIPLIERS,
	DEFAULT_QUALITY_WEIGHT,
	type DifficultyMultipliers,
} from "@/lib/points";

// Single-tenant config: exactly one row (id = 1). Lets the group tune the
// vote budget and points formula without a deploy.
export const appSettings = pgTable(
	"app_settings",
	{
		id: smallint("id").primaryKey().default(1),
		groupName: text("group_name").notNull().default("NextQuest"),
		voteBudget: smallint("vote_budget").notNull().default(10),
		voteMaxPerGame: smallint("vote_max_per_game").notNull().default(4),
		difficultyMultipliers: jsonb("difficulty_multipliers")
			.$type<DifficultyMultipliers>()
			.notNull()
			.default(DEFAULT_DIFFICULTY_MULTIPLIERS),
		// 0–1 strength of the review-score factor in the points formula
		// (src/lib/points.ts qualityMultiplier); 0 disables it.
		qualityWeight: real("quality_weight").notNull().default(DEFAULT_QUALITY_WEIGHT),
		// Vote totals (ascending) at which a backlog game earns a Discord ping,
		// once each ever. Empty array disables milestone notifications.
		voteMilestones: jsonb("vote_milestones").$type<number[]>().notNull().default([5, 10, 15]),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [check("app_settings_single_row", sql`${table.id} = 1`)]
);
