import {
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	smallint,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// A proposal is just a game in `proposed` status — there is no separate
// proposals table. Normal lifecycle: proposed → backlog → playing → completed.
export const gameStatus = pgEnum("game_status", [
	"proposed",
	"backlog",
	"playing",
	"completed",
	"abandoned",
	"rejected",
]);

export const metadataSource = pgEnum("metadata_source", ["steam", "hltb", "manual", "mixed"]);

export const games = pgTable(
	"games",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		title: text("title").notNull(),
		status: gameStatus("status").notNull().default("proposed"),
		proposedBy: text("proposed_by").references(() => user.id, { onDelete: "set null" }),
		pitch: text("pitch"),
		steamAppId: integer("steam_app_id").unique(),
		// HLTB "Main + Extra" hours by convention; manually overridable.
		lengthHours: numeric("length_hours", { precision: 6, scale: 1 }),
		// Group-assigned difficulty, 1 (breezy) to 5 (brutal).
		difficulty: smallint("difficulty"),
		// Stored output of the points formula (src/lib/points.ts). Recomputed
		// only on explicit edit so historical burn-rate stays stable.
		points: smallint("points"),
		pointsOverride: smallint("points_override"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("games_status_idx").on(table.status), index("games_completed_at_idx").on(table.completedAt)]
);

// 1:1 with games, kept separate so provider fetch failures never block a
// game row from existing. `raw` keeps full provider payloads so new fields
// can be re-derived without refetching.
export const gameMetadata = pgTable("game_metadata", {
	gameId: uuid("game_id")
		.primaryKey()
		.references(() => games.id, { onDelete: "cascade" }),
	source: metadataSource("source").notNull().default("manual"),
	coverUrl: text("cover_url"),
	headerUrl: text("header_url"),
	description: text("description"),
	genres: jsonb("genres").$type<string[]>(),
	releaseDate: date("release_date"),
	steamReviewScore: smallint("steam_review_score"),
	steamReviewCount: integer("steam_review_count"),
	metacriticScore: smallint("metacritic_score"),
	hltbMain: numeric("hltb_main", { precision: 6, scale: 1 }),
	hltbMainExtra: numeric("hltb_main_extra", { precision: 6, scale: 1 }),
	hltbCompletionist: numeric("hltb_completionist", { precision: 6, scale: 1 }),
	raw: jsonb("raw"),
	fetchedAt: timestamp("fetched_at", { withTimezone: true }),
});

// Append-only audit of status transitions. Powers burn-rate (transitions to
// `completed`, bucketed by week) and a future activity feed. All status
// changes must go through the transition helper that writes here.
export const gameStatusHistory = pgTable(
	"game_status_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		fromStatus: gameStatus("from_status"),
		toStatus: gameStatus("to_status").notNull(),
		changedBy: text("changed_by").references(() => user.id, { onDelete: "set null" }),
		changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("game_status_history_game_idx").on(table.gameId)]
);
