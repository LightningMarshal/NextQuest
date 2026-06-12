import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { games } from "./games";

// Member-defined tags: a shared vocabulary table plus a game↔tag join. Names
// are normalized (trimmed, lowercased) in the server action so a plain unique
// constraint prevents "RPG"/"rpg" drift. Tags with zero assignments are kept
// on purpose — they stay available as filter/autocomplete vocabulary.
export const tags = pgTable("tags", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameTags = pgTable(
	"game_tags",
	{
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		tagId: uuid("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
		addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		primaryKey({ columns: [table.gameId, table.tagId] }),
		index("game_tags_tag_idx").on(table.tagId),
	]
);
