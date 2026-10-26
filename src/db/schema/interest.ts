import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { games } from "./games";

// "I'm keen" — who wants to play what. Public within the group (names show,
// so the person posting a session knows who to ping). Deliberately a fresh
// signal: the retired budget votes were promised anonymous, so they are
// never converted into keen rows (docs/DECISIONS.md, 2026-09).
export const gameInterest = pgTable(
	"game_interest",
	{
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.gameId, table.userId] })]
);
