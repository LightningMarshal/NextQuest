import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq, gte } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { buildCalendar, deriveCalendarToken, deriveUserCalendarToken } from "@/lib/ical";
import { timingSafeEqual } from "@/lib/ids";
import { canSeeSession } from "@/lib/sessions";
import { appBaseUrl } from "@/server/discord";
import { getAppSettings } from "@/server/settings";

// iCal subscription feed. Calendar apps can't send cookies, so this lives
// outside the auth gates and the URL is the credential. Token check MUST
// stay first, like /api/cron.
//
//   ?u=<userId>&t=<token>  per person (2026-09): revocable by bumping the
//                          person's calendar_feed_version; guests get open
//                          sessions only; revoked/rejected accounts get 404
//   ?token=<token>         legacy group-wide feed (members' view), kept so
//                          existing subscriptions don't silently break;
//                          rotate BETTER_AUTH_SECRET to kill it

export const dynamic = "force-dynamic";

const VENUE_LABELS: Record<string, string> = { virtual: "Online", in_person: "In person", hybrid: "Online + in person" };

// Completed sessions stay on the calendar (they happened); cancelled ones
// ship as STATUS:CANCELLED so subscribed copies disappear.
const LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;

const notFound = () => new Response("not found", { status: 404 });

async function resolveViewer(url: URL, secret: string): Promise<{ role: string } | null> {
	const userId = url.searchParams.get("u");
	const token = url.searchParams.get("t");
	if (userId && token) {
		const [row] = await getDb()
			.select({ role: schema.user.role, status: schema.user.status, version: schema.user.calendarFeedVersion })
			.from(schema.user)
			.where(eq(schema.user.id, userId));
		if (!row || row.status !== "approved") return null;
		const expected = await deriveUserCalendarToken(secret, userId, row.version);
		return timingSafeEqual(token, expected) ? { role: row.role } : null;
	}
	const legacy = url.searchParams.get("token");
	if (legacy && timingSafeEqual(legacy, await deriveCalendarToken(secret))) return { role: "member" };
	return null;
}

export async function GET(request: Request): Promise<Response> {
	const { env } = getCloudflareContext();
	const secret = (env as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET;
	if (!secret) return notFound();
	// 404 (not 401) so probing doesn't learn the endpoint exists.
	const viewer = await resolveViewer(new URL(request.url), secret);
	if (!viewer) return notFound();

	const db = getDb();
	const onlyOpen = !canSeeSession("members", viewer);
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
			.where(
				and(
					gte(schema.events.scheduledAt, new Date(Date.now() - LOOKBACK_MS)),
					onlyOpen ? eq(schema.events.visibility, "open") : undefined
				)
			)
			.orderBy(schema.events.scheduledAt),
	]);

	const base = appBaseUrl();
	const feed = buildCalendar(
		rows.map((row) => ({
			id: row.id,
			title: row.title,
			startsAt: row.scheduledAt,
			durationMinutes: row.durationMinutes,
			location: [row.venue ? VENUE_LABELS[row.venue] : null, row.location].filter(Boolean).join(" — ") || null,
			description: [row.notes, `Who's in: ${base}/s/${row.id}`].filter(Boolean).join("\n\n"),
			updatedAt: row.updatedAt,
			cancelled: row.status === "cancelled",
			url: `${base}/s/${row.id}`,
		})),
		{ name: `NextQuest — ${settings.groupName}` }
	);

	return new Response(feed, {
		headers: {
			"content-type": "text/calendar; charset=utf-8",
			// A short private cache keeps a chatty calendar client off the DB.
			"cache-control": "private, max-age=300",
		},
	});
}
