"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { requireCircleUser } from "@/server/session";

/** Rotate the caller's calendar-feed URL (the old one stops working). */
export async function resetMyCalendarFeed(): Promise<void> {
	const user = await requireCircleUser("/sessions");
	await getDb()
		.update(schema.user)
		.set({ calendarFeedVersion: sql`${schema.user.calendarFeedVersion} + 1` })
		.where(eq(schema.user.id, user.id));
	revalidatePath("/sessions");
}
