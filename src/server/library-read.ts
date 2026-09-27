// Read helpers for the library (server-only, NOT "use server").

import { desc, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

/** Games people are keen on, most-wanted first — the home page's "post one" nudge. */
export async function getKeenGames(limit: number): Promise<{ id: string; title: string; keen: number }[]> {
	const keen = sql<number>`count(${schema.gameInterest.userId})::int`;
	return getDb()
		.select({ id: schema.games.id, title: schema.games.title, keen })
		.from(schema.gameInterest)
		.innerJoin(schema.games, eq(schema.gameInterest.gameId, schema.games.id))
		.where(inArray(schema.games.status, ["proposed", "backlog", "playing"]))
		.groupBy(schema.games.id, schema.games.title)
		.orderBy(desc(keen), schema.games.title)
		.limit(limit);
}
