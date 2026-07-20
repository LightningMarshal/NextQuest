"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireApprovedUser } from "@/server/session";

// Phase 21 (player voice): per-member ratings and per-game discussion.
// Both are PUBLIC within the group — the anonymity invariant covers votes
// only, and these actions never touch the votes table.

const rateSchema = z.object({
	rating: z.coerce.number().int().min(1).max(5),
	note: z.string().trim().max(500).optional(),
});

/**
 * Upsert the caller's rating for a finished game. Finished only: rating
 * mid-playthrough would just be a mood; the group's number should mean
 * "having played it, this is where I landed".
 */
export async function rateGame(gameId: string, formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const parsed = rateSchema.safeParse({
		rating: formData.get("rating"),
		note: formData.get("note") || undefined,
	});
	if (!parsed.success) throw new Error("Pick a rating from 1 to 5.");

	const db = getDb();
	const [game] = await db
		.select({ status: schema.games.status })
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	if (!game) throw new Error("Game not found.");
	if (game.status !== "completed" && game.status !== "abandoned") {
		throw new Error("Ratings open once the group is done with a game.");
	}

	await db
		.insert(schema.gameRatings)
		.values({
			gameId,
			userId: user.id,
			rating: parsed.data.rating,
			note: parsed.data.note ?? null,
		})
		.onConflictDoUpdate({
			target: [schema.gameRatings.gameId, schema.gameRatings.userId],
			set: { rating: parsed.data.rating, note: parsed.data.note ?? null, updatedAt: new Date() },
		});

	revalidatePath("/backlog");
	revalidatePath(`/backlog/${gameId}`);
	revalidatePath("/review");
}

const commentSchema = z.object({
	body: z.string().trim().min(1, "Say something first.").max(2000),
});

/** Append a comment to a game's discussion thread. Any status — arguing
 * about a proposal is the whole point. */
export async function addGameComment(gameId: string, formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const parsed = commentSchema.safeParse({ body: formData.get("body") });
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);

	const db = getDb();
	const [game] = await db
		.select({ id: schema.games.id })
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	if (!game) throw new Error("Game not found.");

	await db.insert(schema.gameComments).values({
		gameId,
		userId: user.id,
		body: parsed.data.body,
	});
	revalidatePath(`/backlog/${gameId}`);
}

/** Delete one of YOUR comments (admins can moderate). No editing — the
 * thread is a record, not a wiki. */
export async function deleteGameComment(commentId: string): Promise<void> {
	const user = await requireApprovedUser();
	const db = getDb();
	const [comment] = await db
		.select({ userId: schema.gameComments.userId, gameId: schema.gameComments.gameId })
		.from(schema.gameComments)
		.where(eq(schema.gameComments.id, commentId));
	if (!comment) throw new Error("Comment not found.");
	if (comment.userId !== user.id && user.role !== "admin") {
		throw new Error("You can only delete your own comments.");
	}
	await db
		.delete(schema.gameComments)
		.where(and(eq(schema.gameComments.id, commentId)));
	revalidatePath(`/backlog/${comment.gameId}`);
}
