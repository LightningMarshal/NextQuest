"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireApprovedUser } from "@/server/session";

// Tags are deliberately open: any approved member can create, assign, and
// remove them on any game — shared vocabulary, not personal labels.

const tagNameSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, "Tag can't be empty")
	.max(30, "Tag must be 30 characters or fewer");

export async function addTagToGame(gameId: string, formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const name = tagNameSchema.parse(formData.get("tag"));

	const db = getDb();
	const [game] = await db
		.select({ id: schema.games.id })
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	if (!game) throw new Error("Game not found.");

	// Two statements instead of a transaction (Neon HTTP has none); the
	// onConflictDoNothing makes a concurrent create of the same name benign.
	await db.insert(schema.tags).values({ name, createdBy: user.id }).onConflictDoNothing();
	const [tag] = await db
		.select({ id: schema.tags.id })
		.from(schema.tags)
		.where(eq(schema.tags.name, name));

	await db
		.insert(schema.gameTags)
		.values({ gameId, tagId: tag.id, addedBy: user.id })
		.onConflictDoNothing();

	revalidatePath("/backlog");
}

export async function removeTagFromGame(gameId: string, tagId: string): Promise<void> {
	await requireApprovedUser();
	const db = getDb();
	await db
		.delete(schema.gameTags)
		.where(and(eq(schema.gameTags.gameId, gameId), eq(schema.gameTags.tagId, tagId)));
	revalidatePath("/backlog");
}
