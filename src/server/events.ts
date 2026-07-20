"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { discordTimestamp, notifyDiscord } from "@/lib/discord";
import { resolveOrCreateGame } from "@/server/game-linking";
import { requireApprovedUser } from "@/server/session";

type Rsvp = (typeof schema.rsvpStatus.enumValues)[number];

const createEventSchema = z.object({
	title: z.string().trim().min(1, "Title is required").max(200),
	gameId: z.string().uuid().optional(),
	scheduledAt: z.coerce
		.date()
		.refine((d) => d.getTime() > Date.now(), "Pick a time in the future.")
		// Every real UTC offset is a multiple of 15 min, so UTC alignment ⇔
		// local alignment; datetime-local never carries seconds.
		.refine(
			(d) => d.getUTCMinutes() % 15 === 0 && d.getUTCSeconds() === 0,
			"Start times use 15-minute increments."
		),
	durationMinutes: z.coerce
		.number()
		.int()
		.positive()
		.max(24 * 60)
		.multipleOf(15, "Duration uses 15-minute increments.")
		.optional(),
	// Structured how-we-meet signal; location stays the free-text detail.
	venue: z.enum(schema.eventVenue.enumValues).optional(),
	location: z.string().trim().max(300).optional(),
	notes: z.string().trim().max(5000).optional(),
});

export async function createEvent(formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const parsed = createEventSchema.safeParse({
		title: formData.get("title"),
		gameId: formData.get("gameId") || undefined,
		// The client form converts datetime-local to ISO (browser timezone)
		// before submitting — never parse the raw datetime-local string on the
		// server, where "local" means UTC.
		scheduledAt: formData.get("scheduledAt"),
		durationMinutes: formData.get("durationMinutes") || undefined,
		venue: formData.get("venue") || undefined,
		location: formData.get("location") || undefined,
		notes: formData.get("notes") || undefined,
	});
	// First issue as a plain Error so the form shows a readable message
	// instead of a ZodError JSON blob.
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	const input = parsed.data;

	const db = getDb();
	const [event] = await db
		.insert(schema.events)
		.values({
			title: input.title,
			gameId: input.gameId,
			scheduledAt: input.scheduledAt,
			durationMinutes: input.durationMinutes,
			venue: input.venue,
			location: input.location,
			notes: input.notes,
			// "Session 1" typed by hand seeds the ordinal chain the same way
			// the backfill migration does for pre-column rows.
			sessionNumber: parseTrailingNumber(input.title),
			createdBy: user.id,
		})
		.returning({ id: schema.events.id });

	// The creator is obviously coming.
	await db.insert(schema.eventAttendance).values({
		eventId: event.id,
		userId: user.id,
		rsvp: "yes",
	});

	notifyDiscord(
		`📅 ${user.name} scheduled **${input.title}** for ${discordTimestamp(input.scheduledAt)}${input.location ? ` (${input.location})` : ""}`
	);
	revalidatePath("/events");
	revalidatePath("/");
}

/** Upsert the calling member's RSVP. Attendance (the after-fact record) is untouched. */
export async function setRsvp(eventId: string, rsvp: Rsvp): Promise<void> {
	const user = await requireApprovedUser();
	if (!schema.rsvpStatus.enumValues.includes(rsvp)) throw new Error("Invalid RSVP.");

	const db = getDb();
	const [event] = await db
		.select({ status: schema.events.status })
		.from(schema.events)
		.where(eq(schema.events.id, eventId));
	if (!event) throw new Error("Event not found.");
	if (event.status !== "scheduled") throw new Error("RSVPs are closed for this event.");

	await db
		.insert(schema.eventAttendance)
		.values({ eventId, userId: user.id, rsvp, respondedAt: new Date() })
		.onConflictDoUpdate({
			target: [schema.eventAttendance.eventId, schema.eventAttendance.userId],
			set: { rsvp, respondedAt: new Date() },
		});

	revalidatePath("/events");
}

// "Session 12" → "Session 13"; titles without a trailing number are copied
// verbatim. Deliberately dumb — a regex, not a naming scheme.
function bumpSessionNumber(title: string): string {
	return title.replace(/(\d+)\s*$/, (match) => String(Number(match) + 1));
}

/** The trailing number bumpSessionNumber operates on, as data — seeds the
 * session_number column so machines never parse titles at read time. */
function parseTrailingNumber(title: string): number | undefined {
	const match = title.match(/(\d+)\s*$/);
	return match ? Number(match[1]) : undefined;
}

type CloneSource = {
	id: string;
	title: string;
	gameId: string | null;
	scheduledAt: Date;
	durationMinutes: number | null;
	venue: (typeof schema.eventVenue.enumValues)[number] | null;
	location: string | null;
	sessionNumber: number | null;
};

// Clone-forward is the recurrence model (docs/DECISIONS.md): "same time next
// week" as an explicit action after each session instead of a rules engine.
// Only the caller is RSVP'd — seeding others' RSVPs from past attendance
// would make them dishonest.
async function cloneEventForward(
	db: ReturnType<typeof getDb>,
	user: { id: string; name: string },
	source: CloneSource
): Promise<void> {
	// A pure +7d offset on the stored timestamptz keeps the weekday and time
	// in every viewer's timezone (DST shifts the wall-clock hour at most).
	const scheduledAt = new Date(source.scheduledAt.getTime() + 7 * 24 * 60 * 60 * 1000);
	const title = bumpSessionNumber(source.title);
	// Column first, title digits as the legacy fallback — pre-column clones
	// only recorded the ordinal in the title.
	const currentNumber = source.sessionNumber ?? parseTrailingNumber(source.title);

	const [event] = await db
		.insert(schema.events)
		.values({
			title,
			gameId: source.gameId,
			scheduledAt,
			durationMinutes: source.durationMinutes,
			venue: source.venue,
			location: source.location,
			sessionNumber: currentNumber !== undefined ? currentNumber + 1 : undefined,
			createdBy: user.id,
		})
		.returning({ id: schema.events.id });

	await db.insert(schema.eventAttendance).values({
		eventId: event.id,
		userId: user.id,
		rsvp: "yes",
	});

	notifyDiscord(
		`📅 ${user.name} scheduled **${title}** for ${discordTimestamp(scheduledAt)}${source.location ? ` (${source.location})` : ""}`
	);
}

/**
 * One-click "same time next week": clones an event 7 days forward, copying
 * game, duration, and location, bumping a trailing session number in the
 * title. Works from any event (the wrap-up form and completed cards call it).
 */
export async function scheduleNextSession(eventId: string): Promise<void> {
	const user = await requireApprovedUser();
	const db = getDb();

	const [source] = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			gameId: schema.events.gameId,
			scheduledAt: schema.events.scheduledAt,
			durationMinutes: schema.events.durationMinutes,
			venue: schema.events.venue,
			location: schema.events.location,
			sessionNumber: schema.events.sessionNumber,
		})
		.from(schema.events)
		.where(eq(schema.events.id, eventId));
	if (!source) throw new Error("Event not found.");

	await cloneEventForward(db, user, source);
	revalidatePath("/events");
	revalidatePath("/");
}

export async function cancelEvent(eventId: string): Promise<void> {
	await requireApprovedUser();
	const db = getDb();
	await db
		.update(schema.events)
		.set({ status: "cancelled", updatedAt: new Date() })
		.where(eq(schema.events.id, eventId));
	revalidatePath("/events");
	revalidatePath("/");
}

const wrapUpSchema = z.object({
	// What was actually played — defaults to the planned game, editable when
	// the night changed. "" clears the link.
	gameId: z.string().uuid().optional(),
	// Issue #32: the group played something not in NextQuest at all. A title
	// here wins over the select and creates (or links) a game row.
	newGameTitle: z.string().trim().min(1).max(200).optional(),
	recap: z.string().trim().max(5000).optional(),
	howItWent: z.coerce.number().int().min(1).max(5).optional(),
	progressNote: z.string().trim().max(2000).optional(),
});

// (Typed-title → game id resolution lives in game-linking.ts, shared with
// grid-poll creation.)

/**
 * Wrap up a session: record who actually showed up (checkbox per approved
 * member), capture the recap / rating / progress and what was played, and
 * mark the event completed. Writes the recap to its own column — the planning
 * notes are never overwritten.
 */
export async function recordAttendance(eventId: string, formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const db = getDb();

	const parsed = wrapUpSchema.safeParse({
		gameId: formData.get("gameId") || undefined,
		newGameTitle: formData.get("newGameTitle") || undefined,
		recap: formData.get("recap") || undefined,
		howItWent: formData.get("howItWent") || undefined,
		progressNote: formData.get("progressNote") || undefined,
	});
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	const input = parsed.data;

	const [event] = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			gameId: schema.events.gameId,
			scheduledAt: schema.events.scheduledAt,
			durationMinutes: schema.events.durationMinutes,
			venue: schema.events.venue,
			location: schema.events.location,
			sessionNumber: schema.events.sessionNumber,
			status: schema.events.status,
		})
		.from(schema.events)
		.where(eq(schema.events.id, eventId));
	if (!event) throw new Error("Event not found.");
	if (event.status !== "scheduled") throw new Error("This event is already wrapped up.");

	const attendedIds = new Set(formData.getAll("attended").map(String));
	const members = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(eq(schema.user.status, "approved"));

	// Neon's HTTP driver has no transactions; per-member upserts are fine at
	// friend-group scale and idempotent on retry.
	for (const member of members) {
		await db
			.insert(schema.eventAttendance)
			.values({ eventId, userId: member.id, attended: attendedIds.has(member.id) })
			.onConflictDoUpdate({
				target: [schema.eventAttendance.eventId, schema.eventAttendance.userId],
				set: { attended: attendedIds.has(member.id) },
			});
	}

	// A typed-in title wins over the select (issue #32) — it links an existing
	// game by name or creates a minimal proposed one.
	const playedGameId = input.newGameTitle
		? await resolveOrCreateGame(db, user, input.newGameTitle, `the wrap-up of “${event.title}”`)
		: (input.gameId ?? null);

	// The wrap-up form always submits the game select, so treat it as
	// authoritative (a blank selection clears the link). Planning notes are
	// left untouched — the recap lives in its own column now.
	await db
		.update(schema.events)
		.set({
			status: "completed",
			gameId: playedGameId,
			recap: input.recap ?? null,
			howItWent: input.howItWent ?? null,
			progressNote: input.progressNote ?? null,
			updatedAt: new Date(),
		})
		.where(eq(schema.events.id, eventId));

	// "Same time next week" checkbox on the wrap-up form — one round-trip.
	// Clone from the confirmed game, not the originally-planned one.
	if (formData.get("scheduleNext")) {
		await cloneEventForward(db, user, { ...event, gameId: playedGameId });
	}

	revalidatePath("/events");
	revalidatePath("/");
}
