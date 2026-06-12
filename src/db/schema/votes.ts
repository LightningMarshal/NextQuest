import {
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { games } from "./games";

// Budget-allocation voting: each approved member spreads `vote_budget`
// points (app_settings) across backlog games, capped at `vote_max_per_game`
// per game. Priority = SUM(weight) descending.
//
// ANONYMITY INVARIANT: `user_id` exists only to dedup/upsert a member's own
// ballot. Read paths must return only {game_id, SUM(weight)} aggregates —
// never select or expose user_id except when loading the requesting user's
// own allocations.
export const votes = pgTable(
	"votes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		weight: smallint("weight").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [uniqueIndex("votes_game_user_unique").on(table.gameId, table.userId)]
);

// Dedup ledger for milestone Discord pings: the composite PK makes
// "notify once, ever" a single atomic onConflictDoNothing insert (Neon HTTP
// has no transactions). Rows deliberately outlive the votes themselves —
// votes are cleared when a game leaves the backlog, but a re-backlogged game
// re-crossing an already-notified threshold stays silent. The milestone set
// lives in app_settings.vote_milestones.
export const gameVoteMilestones = pgTable(
	"game_vote_milestones",
	{
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		milestone: smallint("milestone").notNull(),
		notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.gameId, table.milestone] })]
);
