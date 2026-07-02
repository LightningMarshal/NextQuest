"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { notifyDiscord } from "@/lib/discord";
import { requireApprovedUser } from "@/server/session";
import { getAppSettings } from "@/server/settings";

// ANONYMITY INVARIANT (see src/db/schema/votes.ts): nothing in this module
// may ever return another member's user_id or per-user allocations. Tallies
// are {gameId, totalWeight} aggregates only; the single per-user read is the
// calling member's own ballot.

/**
 * Upsert the calling member's allocation for one backlog game.
 * weight 0 removes the allocation (returns budget).
 */
export async function setVote(gameId: string, weight: number): Promise<void> {
	const user = await requireApprovedUser();
	const settings = await getAppSettings();

	if (!Number.isInteger(weight) || weight < 0 || weight > settings.voteMaxPerGame) {
		throw new Error(`Weight must be between 0 and ${settings.voteMaxPerGame}.`);
	}

	const db = getDb();
	const [game] = await db
		.select({ status: schema.games.status })
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	if (!game) throw new Error("Game not found.");
	if (game.status !== "backlog") throw new Error("Only backlog games can be voted on.");

	if (weight === 0) {
		await db
			.delete(schema.votes)
			.where(and(eq(schema.votes.gameId, gameId), eq(schema.votes.userId, user.id)));
	} else {
		const [{ otherTotal }] = await db
			.select({ otherTotal: sql<number>`coalesce(sum(${schema.votes.weight}), 0)::int` })
			.from(schema.votes)
			.where(and(eq(schema.votes.userId, user.id), ne(schema.votes.gameId, gameId)));
		if (otherTotal + weight > settings.voteBudget) {
			throw new Error(
				`That would spend ${otherTotal + weight} of your ${settings.voteBudget} points.`
			);
		}

		await db
			.insert(schema.votes)
			.values({ gameId, userId: user.id, weight, updatedAt: new Date() })
			.onConflictDoUpdate({
				target: [schema.votes.gameId, schema.votes.userId],
				set: { weight, updatedAt: new Date() },
			});

		// Milestone bookkeeping must never fail a vote.
		try {
			await maybeNotifyVoteMilestones(db, gameId, settings.voteMilestones);
		} catch (error) {
			console.warn("vote milestone check failed:", error);
		}
	}

	revalidatePath("/pick");
	revalidatePath("/backlog");
}

/**
 * Discord ping the first time a game's aggregate tally reaches each
 * configured milestone. The game_vote_milestones PK + onConflictDoNothing
 * gives fire-once-ever semantics; if an admin lowers thresholds later,
 * already-qualifying games fire on their next vote (acceptable backfill).
 * ANONYMITY: the message carries the game and aggregate total only.
 */
async function maybeNotifyVoteMilestones(
	db: ReturnType<typeof getDb>,
	gameId: string,
	milestones: number[]
): Promise<void> {
	if (milestones.length === 0) return;

	const [{ total }] = await db
		.select({ total: sql<number>`coalesce(sum(${schema.votes.weight}), 0)::int` })
		.from(schema.votes)
		.where(eq(schema.votes.gameId, gameId));

	const reached = milestones.filter((milestone) => total >= milestone);
	if (reached.length === 0) return;

	const claimed = await db
		.insert(schema.gameVoteMilestones)
		.values(reached.map((milestone) => ({ gameId, milestone })))
		.onConflictDoNothing()
		.returning({ milestone: schema.gameVoteMilestones.milestone });
	if (claimed.length === 0) return;

	const [game] = await db
		.select({ title: schema.games.title })
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	// One message even when a single vote jumps multiple thresholds.
	const top = Math.max(...claimed.map((row) => row.milestone));
	notifyDiscord(`📈 **${game?.title ?? "A game"}** just hit ${top} group votes!`);
}

/** The calling member's own ballot + remaining budget. */
export async function getMyBallot(): Promise<{
	allocations: { gameId: string; weight: number }[];
	remainingBudget: number;
}> {
	const user = await requireApprovedUser();
	const settings = await getAppSettings();
	const db = getDb();

	const allocations = await db
		.select({ gameId: schema.votes.gameId, weight: schema.votes.weight })
		.from(schema.votes)
		.where(eq(schema.votes.userId, user.id));

	const spent = allocations.reduce((total, allocation) => total + allocation.weight, 0);
	return { allocations, remainingBudget: settings.voteBudget - spent };
}

/** Aggregate priority order — totals only, never voter identity. */
export async function getVoteTally(): Promise<{ gameId: string; totalWeight: number }[]> {
	await requireApprovedUser();
	const db = getDb();
	return db
		.select({
			gameId: schema.votes.gameId,
			totalWeight: sql<number>`sum(${schema.votes.weight})::int`,
		})
		.from(schema.votes)
		.groupBy(schema.votes.gameId);
}
