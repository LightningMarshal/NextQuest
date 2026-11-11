"use server";

// Admin clean-up for the library (Phase 23): hard-delete a spam/typo entry,
// or merge a duplicate into the entry that should survive. Until now the
// only exit was `rejected`, which keeps the row forever. Both are
// irreversible, admin-only, and atomic (db.batch = one transaction).
//
// Neither touches games.status — the status invariant (applyStatusTransition
// is the only writer) is intact: a delete removes the row, a merge keeps the
// target's status and history as they are.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { deleteBlocker, mergeBlocker } from "@/lib/game-hygiene";
import { isUuid } from "@/lib/ids";
import { requireAdmin } from "@/server/session";

async function loadGame(db: ReturnType<typeof getDb>, gameId: string) {
	if (!isUuid(gameId)) return undefined;
	const [game] = await db
		.select({
			id: schema.games.id,
			title: schema.games.title,
			status: schema.games.status,
			startedAt: schema.games.startedAt,
		})
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	return game;
}

function confirmed(formData: FormData): void {
	if (formData.get("confirm") !== "yes") throw new Error("Tick the box to confirm — this can't be undone.");
}

/**
 * Remove a game and everything hanging off it (metadata, tags, interest,
 * comments, legacy votes — all cascade). Scheduled or cancelled sessions
 * that pointed at it simply lose their game link. Refused for anything the
 * group actually played (see deleteBlocker).
 */
export async function deleteGame(gameId: string, formData: FormData): Promise<void> {
	await requireAdmin();
	confirmed(formData);
	const db = getDb();
	const game = await loadGame(db, gameId);
	if (!game) throw new Error("Game not found.");
	const [{ played }] = await db
		.select({ played: sql<number>`count(*)::int` })
		.from(schema.events)
		.where(and(eq(schema.events.gameId, gameId), eq(schema.events.status, "completed")));
	const blocker = deleteBlocker(game, played);
	if (blocker) throw new Error(blocker);

	// Conditional on the status we just checked: a concurrent "start playing"
	// makes this match nothing rather than delete a game mid-transition.
	const removed = await db
		.delete(schema.games)
		.where(and(eq(schema.games.id, gameId), eq(schema.games.status, game.status)))
		.returning({ id: schema.games.id });
	if (removed.length === 0) throw new Error("Someone else just changed this game — refresh and try again.");

	revalidatePath("/backlog");
	revalidatePath("/");
	redirect("/backlog");
}

/**
 * Fold `sourceId` (the duplicate) into the game picked in the form, then
 * delete the duplicate. The target keeps its own title, status, history,
 * and metadata; it gains the duplicate's sessions, polls, comments, and —
 * where the same person hasn't already said so on the target — "I'd play
 * this" marks, ratings, and tags.
 *
 * Legacy budget votes: per-member rows are moved only when the target is
 * still in the backlog (votes exist nowhere else), on the same
 * one-ballot-per-member rule, and are never read or exposed here — the
 * anonymity invariant holds.
 */
export async function mergeGame(sourceId: string, formData: FormData): Promise<void> {
	await requireAdmin();
	confirmed(formData);
	const targetId = String(formData.get("targetId") ?? "");
	const db = getDb();
	const [source, target] = await Promise.all([loadGame(db, sourceId), loadGame(db, targetId)]);
	if (!source) throw new Error("Game not found.");
	if (!target) throw new Error("Pick the game to merge into.");
	const blocker = mergeBlocker(source, target);
	if (blocker) throw new Error(blocker);

	const from = sql`${source.id}::uuid`;
	const into = sql`${target.id}::uuid`;
	await db.batch([
		db.update(schema.events).set({ gameId: target.id }).where(eq(schema.events.gameId, source.id)),
		db.update(schema.availabilityPolls).set({ gameId: target.id }).where(eq(schema.availabilityPolls.gameId, source.id)),
		db.update(schema.gameComments).set({ gameId: target.id }).where(eq(schema.gameComments.gameId, source.id)),
		db.execute(sql`
			insert into ${schema.gameInterest} (game_id, user_id, created_at)
			select ${into}, user_id, created_at from ${schema.gameInterest} where game_id = ${from}
			on conflict do nothing`),
		db.execute(sql`
			insert into ${schema.gameRatings} (game_id, user_id, rating, note, created_at, updated_at)
			select ${into}, user_id, rating, note, created_at, updated_at from ${schema.gameRatings} where game_id = ${from}
			on conflict do nothing`),
		db.execute(sql`
			insert into ${schema.gameTags} (game_id, tag_id, added_by, created_at)
			select ${into}, tag_id, added_by, created_at from ${schema.gameTags} where game_id = ${from}
			on conflict do nothing`),
		db.execute(sql`
			insert into ${schema.votes} (game_id, user_id, weight, updated_at)
			select ${into}, user_id, weight, updated_at from ${schema.votes}
			where game_id = ${from} and ${target.status}::text = 'backlog'
			on conflict do nothing`),
		// Last: the cascade removes whatever wasn't carried over, plus the
		// duplicate's own metadata and status history.
		db.delete(schema.games).where(eq(schema.games.id, source.id)),
	]);

	revalidatePath("/backlog");
	revalidatePath("/");
	revalidatePath(`/backlog/${target.id}`);
	redirect(`/backlog/${target.id}`);
}
