"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { isUuid } from "@/lib/ids";
import { applyStatusTransition } from "@/server/game-status";
import { requireMember } from "@/server/session";

/**
 * Toggle "I'd play this" on a game ("keen" is the code name). Public
 * within the group (names show) — the signal a host uses to decide what to
 * post and who to ping.
 *
 * "A proposal needs a second" (docs/DECISIONS.md 2026-07-12), in keen form:
 * when someone OTHER than the proposer marks a proposed game keen, it moves
 * to the backlog through the normal status path (history appended).
 */
export async function setKeen(gameId: string, keen: boolean): Promise<void> {
	const user = await requireMember(`/backlog/${gameId}`);
	if (!isUuid(gameId)) throw new Error("Game not found.");
	const db = getDb();
	const [game] = await db
		.select({ status: schema.games.status, proposedBy: schema.games.proposedBy })
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	if (!game) throw new Error("Game not found.");

	if (keen) {
		await db.insert(schema.gameInterest).values({ gameId, userId: user.id }).onConflictDoNothing();
		if (game.status === "proposed" && game.proposedBy !== user.id) {
			// Best effort: a concurrent move just means someone else got there first.
			await applyStatusTransition(db, gameId, "backlog", user.id);
		}
	} else {
		await db
			.delete(schema.gameInterest)
			.where(and(eq(schema.gameInterest.gameId, gameId), eq(schema.gameInterest.userId, user.id)));
	}

	revalidatePath("/backlog");
	revalidatePath(`/backlog/${gameId}`);
	revalidatePath("/");
}
