import { getCloudflareContext } from "@opennextjs/cloudflare";
import { gte } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { buildCalendar, deriveCalendarToken } from "@/lib/ical";
import { getAppSettings } from "@/server/settings";

// iCal subscription feed (issue #24). Calendar apps can't send cookies, so
// this lives outside the (app) auth gate behind a derived token — the URL is
// the credential (see deriveCalendarToken for the trade-off). Token check
// MUST stay first, like /api/cron.

export const dynamic = "force-dynamic";

const VENUE_LABELS: Record<string, string> = {
	virtual: "Virtual",
	in_person: "In person",
	hybrid: "Hybrid",
};

// Everything from the recent past onward: completed sessions stay on the
// calendar (they happened), cancelled ones ship as STATUS:CANCELLED so
// subscribed copies disappear instead of lingering.
const LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
	const { env } = getCloudflareContext();
	const secret = (env as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET;
	if (!secret) return new Response("not found", { status: 404 });

	const expected = await deriveCalendarToken(secret);
	const token = new URL(request.url).searchParams.get("token");
	// 404 (not 401) so probing doesn't learn the endpoint exists.
	if (!token || token !== expected) return new Response("not found", { status: 404 });

	const db = getDb();
	const [settings, rows] = await Promise.all([
		getAppSettings(),
		db
			.select({
				id: schema.events.id,
				title: schema.events.title,
				status: schema.events.status,
				scheduledAt: schema.events.scheduledAt,
				durationMinutes: schema.events.durationMinutes,
				venue: schema.events.venue,
				location: schema.events.location,
				notes: schema.events.notes,
				updatedAt: schema.events.updatedAt,
			})
			.from(schema.events)
			.where(gte(schema.events.scheduledAt, new Date(Date.now() - LOOKBACK_MS)))
			.orderBy(schema.events.scheduledAt),
	]);

	const feed = buildCalendar(
		rows.map((row) => ({
			id: row.id,
			title: row.title,
			startsAt: row.scheduledAt,
			durationMinutes: row.durationMinutes,
			location:
				[row.venue ? VENUE_LABELS[row.venue] : null, row.location].filter(Boolean).join(" — ") ||
				null,
			description: row.notes,
			updatedAt: row.updatedAt,
			cancelled: row.status === "cancelled",
		})),
		{ name: `NextQuest — ${settings.groupName}` }
	);

	return new Response(feed, {
		headers: {
			"content-type": "text/calendar; charset=utf-8",
			// Calendar clients poll on their own cadence; a short shared cache
			// keeps a chatty client from hammering the database.
			"cache-control": "private, max-age=300",
		},
	});
}
