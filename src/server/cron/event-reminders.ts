// Cron task (hourly, via the secret-gated /api/cron route):
//   1. Discord reminders ~24h and ~1h before each scheduled session — with
//      who's in and a link, to every webhook that can see the session
//   2. one "how did it go?" nudge ~12h after a session ends unwrapped
//   3. auto-close: a session still unwrapped 48h after it ended is closed
//      as played, with "in" RSVPs presumed present (owner decision, 2026-09)
//   4. one "nobody rated this" nudge for finished games (Phase 21)
// Every send is claimed with a single-statement conditional UPDATE first, so
// a concurrent or repeated tick can never double-send.

import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { AUTO_CLOSE_AFTER_MS, DEFAULT_SESSION_MINUTES } from "@/lib/sessions";
import { md, notifyDiscord, postSessionReminders, syncSessionAnnouncement } from "@/server/discord";

const HOUR_MS = 60 * 60 * 1000;
const WRAP_UP_NUDGE_AFTER_MS = 12 * HOUR_MS;
const RATING_NUDGE_AFTER_MS = 3 * 24 * HOUR_MS;

/** scheduled_at + duration (default 3h): when a session is over. */
const ENDS_AT = sql`${schema.events.scheduledAt} + make_interval(mins => coalesce(${schema.events.durationMinutes}, ${DEFAULT_SESSION_MINUTES}))`;

async function goingNames(db: ReturnType<typeof getDb>, eventId: string): Promise<string[]> {
	const rows = await db
		.select({ name: schema.user.name })
		.from(schema.eventAttendance)
		.innerJoin(schema.user, eq(schema.eventAttendance.userId, schema.user.id))
		.where(and(eq(schema.eventAttendance.eventId, eventId), eq(schema.eventAttendance.rsvp, "yes")));
	return rows.map((row) => row.name.split(" ")[0]);
}

function whoLine(names: string[], capacity: number | null): string {
	if (names.length === 0) return "nobody's in yet";
	const seats = capacity !== null ? ` (${names.length}/${capacity})` : "";
	return `in${seats}: ${names.map(md).join(", ")}`;
}

export async function sendEventReminders(): Promise<{
	sent1h: number;
	sent24h: number;
	sentWrapUpNudges: number;
	autoClosed: number;
	sentRatingNudges: number;
}> {
	const db = getDb();
	const now = new Date();
	const in1h = new Date(now.getTime() + HOUR_MS);
	const in24h = new Date(now.getTime() + 24 * HOUR_MS);
	const reminders: Parameters<typeof postSessionReminders>[0] = [];
	let sent1h = 0;
	let sent24h = 0;

	const fields = {
		id: schema.events.id,
		title: schema.events.title,
		scheduledAt: schema.events.scheduledAt,
		visibility: schema.events.visibility,
		capacity: schema.events.capacity,
	};

	// Claiming the 1h marker also backfills the 24h one, so a session posted
	// less than a day out gets a single reminder, not two.
	const startingSoon = await db
		.update(schema.events)
		.set({ reminder1hSentAt: now, reminder24hSentAt: sql`coalesce(${schema.events.reminder24hSentAt}, ${now})` })
		.where(
			and(
				eq(schema.events.status, "scheduled"),
				gt(schema.events.scheduledAt, now),
				lte(schema.events.scheduledAt, in1h),
				isNull(schema.events.reminder1hSentAt)
			)
		)
		.returning(fields);
	for (const event of startingSoon) {
		const who = whoLine(await goingNames(db, event.id), event.capacity);
		reminders.push({
			eventId: event.id,
			visibility: event.visibility,
			text: (link) => `⏰ **${md(event.title)}** starts <t:${Math.floor(event.scheduledAt.getTime() / 1000)}:R> — ${who}. Hop in: ${link}`,
		});
		sent1h += 1;
	}

	const tomorrow = await db
		.update(schema.events)
		.set({ reminder24hSentAt: now })
		.where(
			and(
				eq(schema.events.status, "scheduled"),
				gt(schema.events.scheduledAt, in1h),
				lte(schema.events.scheduledAt, in24h),
				isNull(schema.events.reminder24hSentAt)
			)
		)
		.returning(fields);
	for (const event of tomorrow) {
		const who = whoLine(await goingNames(db, event.id), event.capacity);
		reminders.push({
			eventId: event.id,
			visibility: event.visibility,
			text: (link) => `🔔 Coming up: **${md(event.title)}** <t:${Math.floor(event.scheduledAt.getTime() / 1000)}:F> — ${who}. ${link}`,
		});
		sent24h += 1;
	}

	// Unwrapped well after it ENDED (not started): one nudge, then silence.
	// Sessions already past the auto-close point are skipped — they close
	// below, and nagging about a session in the same tick it closes is noise.
	const nudgeCutoff = new Date(now.getTime() - WRAP_UP_NUDGE_AFTER_MS);
	const closeCutoff = new Date(now.getTime() - AUTO_CLOSE_AFTER_MS);
	const needsWrapUp = await db
		.update(schema.events)
		.set({ wrapUpNudgeSentAt: now })
		.where(
			and(
				eq(schema.events.status, "scheduled"),
				sql`${ENDS_AT} <= ${nudgeCutoff}`,
				sql`${ENDS_AT} > ${closeCutoff}`,
				isNull(schema.events.wrapUpNudgeSentAt)
			)
		)
		.returning(fields);
	for (const event of needsWrapUp) {
		reminders.push({
			eventId: event.id,
			visibility: "members", // wrap-ups are a members' chore
			text: (link) => `📝 How did **${md(event.title)}** go? Ten seconds to wrap it up: ${link} (it closes itself in a day or so if nobody does).`,
		});
	}

	// Auto-close: nobody wrapped it up. Attendance defaults to "in" RSVPs;
	// both writes are one transaction per session.
	const stale = await db
		.select({ id: schema.events.id })
		.from(schema.events)
		.where(and(eq(schema.events.status, "scheduled"), sql`${ENDS_AT} <= ${closeCutoff}`))
		.limit(50);
	let autoClosed = 0;
	for (const { id } of stale) {
		const [closed] = await db.batch([
			db
				.update(schema.events)
				.set({ status: "completed", autoClosed: true, wrappedUpAt: now, updatedAt: now })
				.where(and(eq(schema.events.id, id), eq(schema.events.status, "scheduled")))
				.returning({ id: schema.events.id }),
			db
				.update(schema.eventAttendance)
				.set({ attended: sql`(${schema.eventAttendance.rsvp} = 'yes')` })
				.where(and(eq(schema.eventAttendance.eventId, id), isNull(schema.eventAttendance.attended))),
		]);
		if (closed.length > 0) {
			autoClosed += 1;
			syncSessionAnnouncement(id);
		}
	}

	// A finished game with zero ratings a few days on gets one ask.
	const ratingCutoff = new Date(now.getTime() - RATING_NUDGE_AFTER_MS);
	const unrated = await db
		.update(schema.games)
		.set({ ratingNudgeSentAt: now })
		.where(
			and(
				eq(schema.games.status, "completed"),
				lte(schema.games.completedAt, ratingCutoff),
				isNull(schema.games.ratingNudgeSentAt),
				sql`not exists (select 1 from "game_ratings" where "game_ratings"."game_id" = ${schema.games.id})`
			)
		)
		.returning({ title: schema.games.title });
	for (const game of unrated) {
		notifyDiscord(`🎲 **${md(game.title)}** is finished but nobody's rated it — drop your score on the game page while it's fresh.`);
	}

	postSessionReminders(reminders);
	return {
		sent1h,
		sent24h,
		sentWrapUpNudges: needsWrapUp.length,
		autoClosed,
		sentRatingNudges: unrated.length,
	};
}
