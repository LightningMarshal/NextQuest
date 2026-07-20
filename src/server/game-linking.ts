// Server-only helper (NOT a "use server" module — exporting from one would
// mint POST endpoints): resolve a typed-in game title to a game id. Reuses
// an existing row on a case-insensitive title match so casual typing never
// mints duplicates, else creates a minimal proposed game. No metadata fetch —
// the calling flows (wrap-up #32, poll creation #37) must stay fast and
// offline-tolerant; "Refresh metadata" on the card fills it in later.

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { notifyDiscord } from "@/lib/discord";

export async function resolveOrCreateGame(
	db: ReturnType<typeof getDb>,
	user: { id: string; name: string },
	title: string,
	/** Where it came from, for the pitch and the Discord line. */
	sourceLabel: string
): Promise<string> {
	const [existing] = await db
		.select({ id: schema.games.id })
		.from(schema.games)
		.where(sql`lower(${schema.games.title}) = lower(${title})`);
	if (existing) return existing.id;

	const [game] = await db
		.insert(schema.games)
		.values({
			title,
			status: "proposed",
			proposedBy: user.id,
			pitch: `Added from ${sourceLabel}.`,
		})
		.returning({ id: schema.games.id });
	await db.insert(schema.gameMetadata).values({ gameId: game.id, source: "manual" });
	await db.insert(schema.gameStatusHistory).values({
		gameId: game.id,
		fromStatus: null,
		toStatus: "proposed",
		changedBy: user.id,
	});
	notifyDiscord(`🎮 ${user.name} added **${title}** (from ${sourceLabel})`);
	revalidatePath("/backlog");
	return game.id;
}
