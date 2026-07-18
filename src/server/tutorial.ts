"use server";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { requireApprovedUser } from "@/server/session";

/**
 * Stamp the welcome tour as seen for the calling member (issue #13).
 * Fired when the tour is finished OR skipped — either way they chose,
 * so it never auto-opens again (replay stays in the user menu).
 */
export async function markTutorialSeen(): Promise<void> {
	const user = await requireApprovedUser();
	const db = getDb();
	await db
		.update(schema.user)
		.set({ tutorialSeenAt: new Date(), updatedAt: new Date() })
		.where(eq(schema.user.id, user.id));
}
