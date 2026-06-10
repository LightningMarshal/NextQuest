import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

import { DEFAULT_DIFFICULTY_MULTIPLIERS, type DifficultyMultipliers } from "@/lib/points";

// Single-tenant config: exactly one row (id = 1). Lets the group tune the
// vote budget and points formula without a deploy.
export const appSettings = pgTable(
	"app_settings",
	{
		id: smallint("id").primaryKey().default(1),
		groupName: text("group_name").notNull().default("stooge-log"),
		voteBudget: smallint("vote_budget").notNull().default(10),
		voteMaxPerGame: smallint("vote_max_per_game").notNull().default(4),
		difficultyMultipliers: jsonb("difficulty_multipliers")
			.$type<DifficultyMultipliers>()
			.notNull()
			.default(DEFAULT_DIFFICULTY_MULTIPLIERS),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [check("app_settings_single_row", sql`${table.id} = 1`)]
);
