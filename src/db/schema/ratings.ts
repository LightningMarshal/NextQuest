import { index, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { games } from "./games";

// Phase 21 (player voice): the individual member's opinion, which nothing
// else in the app captures — votes are anonymous aggregates, how_it_went
// rates a session for the whole table, quality signals come from strangers.
// Ratings and comments are PUBLIC within the group, like RSVPs and
// availability. The vote-anonymity invariant is untouched.

// One rating per member per game, upserted; left once a game is finished
// (completed/abandoned — the action enforces it).
export const gameRatings = pgTable(
	"game_ratings",
	{
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** 1–5, action-validated. */
		rating: smallint("rating").notNull(),
		/** Optional one-line take. */
		note: text("note"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.gameId, table.userId] })]
);

// Lightweight discussion thread on the game page — the argument about a
// proposal used to happen in Discord, invisible a year later. Append-only;
// authors can delete their own, nobody edits (no edit wars, no history).
export const gameComments = pgTable(
	"game_comments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		// set null (not cascade): a departed member's side of an argument still
		// provides context, just unattributed.
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		body: text("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("game_comments_game_idx").on(table.gameId)]
);
