// Server-only: the signed-in person's calendar feed URL.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { deriveUserCalendarToken } from "@/lib/ical";
import { appBaseUrl } from "@/server/discord";

export async function myCalendarFeedUrl(userId: string): Promise<string | null> {
	const secret = (getCloudflareContext().env as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET;
	const base = appBaseUrl();
	if (!secret || !base) return null;
	const [row] = await getDb()
		.select({ version: schema.user.calendarFeedVersion })
		.from(schema.user)
		.where(eq(schema.user.id, userId));
	if (!row) return null;
	const token = await deriveUserCalendarToken(secret, userId, row.version);
	return `${base}/api/calendar?u=${encodeURIComponent(userId)}&t=${token}`;
}
