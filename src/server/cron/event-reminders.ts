// Cron task (hourly, via the secret-gated /api/cron route): Discord
// reminders ~24h and ~1h before each scheduled event, plus a single
// post-event "needs wrap-up" nudge (issue #23) once a session has sat
// unwrapped for a while. Sent-markers on the events row are claimed with
// single-statement conditional UPDATEs, so a concurrent or repeated tick can
// never double-send (Neon HTTP has no transactions). Cancelled/completed
// events drop out via the status filter; their unsent markers simply never
// fire — wrapping up or cancelling before the nudge window prevents it.

import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { discordTimestamp, notifyDiscord } from "@/lib/discord";

const HOUR_MS = 60 * 60 * 1000;
// How long a past session may sit unwrapped before the nudge: long enough
// that the morning after an evening session is the typical firing time.
const WRAP_UP_NUDGE_AFTER_MS = 12 * HOUR_MS;

export async function sendEventReminders(): Promise<{
	sent1h: number;
	sent24h: number;
	sentWrapUpNudges: number;
}> {
	const db = getDb();
	const now = new Date();
	const in1h = new Date(now.getTime() + HOUR_MS);
	const in24h = new Date(now.getTime() + 24 * HOUR_MS);

	let sent1h = 0;
	let sent24h = 0;
	let sentWrapUpNudges = 0;

	const startingSoon = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			scheduledAt: schema.events.scheduledAt,
			location: schema.events.location,
		})
		.from(schema.events)
		.where(
			and(
				eq(schema.events.status, "scheduled"),
				gt(schema.events.scheduledAt, now),
				lte(schema.events.scheduledAt, in1h),
				isNull(schema.events.reminder1hSentAt)
			)
		);
	for (const event of startingSoon) {
		// Claiming the 1h marker also backfills the 24h one, so an event
		// created less than 24h out gets a single reminder, not two.
		const claimed = await db
			.update(schema.events)
			.set({
				reminder1hSentAt: now,
				reminder24hSentAt: sql`coalesce(${schema.events.reminder24hSentAt}, ${now})`,
			})
			.where(and(eq(schema.events.id, event.id), isNull(schema.events.reminder1hSentAt)))
			.returning({ id: schema.events.id });
		if (claimed.length === 0) continue;
		notifyDiscord(
			`⏰ **${event.title}** starts ${discordTimestamp(event.scheduledAt)}${
				event.location ? ` — ${event.location}` : ""
			}`
		);
		sent1h += 1;
	}

	const tomorrow = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			scheduledAt: schema.events.scheduledAt,
			location: schema.events.location,
		})
		.from(schema.events)
		.where(
			and(
				eq(schema.events.status, "scheduled"),
				gt(schema.events.scheduledAt, in1h),
				lte(schema.events.scheduledAt, in24h),
				isNull(schema.events.reminder24hSentAt)
			)
		);
	for (const event of tomorrow) {
		const claimed = await db
			.update(schema.events)
			.set({ reminder24hSentAt: now })
			.where(and(eq(schema.events.id, event.id), isNull(schema.events.reminder24hSentAt)))
			.returning({ id: schema.events.id });
		if (claimed.length === 0) continue;
		notifyDiscord(
			`🔔 Reminder: **${event.title}** is ${discordTimestamp(event.scheduledAt)}${
				event.location ? ` — ${event.location}` : ""
			}`
		);
		sent24h += 1;
	}

	// Post-event: still `scheduled` well past its start time means nobody has
	// wrapped it up (or cancelled it) — one nudge, then silence.
	const nudgeCutoff = new Date(now.getTime() - WRAP_UP_NUDGE_AFTER_MS);
	const needsWrapUp = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			scheduledAt: schema.events.scheduledAt,
		})
		.from(schema.events)
		.where(
			and(
				eq(schema.events.status, "scheduled"),
				lte(schema.events.scheduledAt, nudgeCutoff),
				isNull(schema.events.wrapUpNudgeSentAt)
			)
		);
	for (const event of needsWrapUp) {
		const claimed = await db
			.update(schema.events)
			.set({ wrapUpNudgeSentAt: now })
			.where(and(eq(schema.events.id, event.id), isNull(schema.events.wrapUpNudgeSentAt)))
			.returning({ id: schema.events.id });
		if (claimed.length === 0) continue;
		notifyDiscord(
			`📝 **${event.title}** (${discordTimestamp(event.scheduledAt)}) needs a wrap-up — who showed up, how did it go? Head to the events page to close it out.`
		);
		sentWrapUpNudges += 1;
	}

	return { sent1h, sent24h, sentWrapUpNudges };
}
