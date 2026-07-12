"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { discordTimestamp, notifyDiscord } from "@/lib/discord";
import { requireApprovedUser } from "@/server/session";

type Rsvp = (typeof schema.rsvpStatus.enumValues)[number];

const createEventSchema = z.object({
	title: z.string().trim().min(1, "Title is required").max(200),
	gameId: z.string().uuid().optional(),
	scheduledAt: z.coerce.date(),
	durationMinutes: z.coerce.number().int().positive().max(24 * 60).optional(),
	location: z.string().trim().max(300).optional(),
	notes: z.string().trim().max(5000).optional(),
});

export async function createEvent(formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const input = createEventSchema.parse({
		title: formData.get("title"),
		gameId: formData.get("gameId") || undefined,
		// The client form converts datetime-local to ISO (browser timezone)
		// before submitting — never parse the raw datetime-local string on the
		// server, where "local" means UTC.
		scheduledAt: formData.get("scheduledAt"),
		durationMinutes: formData.get("durationMinutes") || undefined,
		location: formData.get("location") || undefined,
		notes: formData.get("notes") || undefined,
	});

	const db = getDb();
	const [event] = await db
		.insert(schema.events)
		.values({
			title: input.title,
			gameId: input.gameId,
			scheduledAt: input.scheduledAt,
			durationMinutes: input.durationMinutes,
			location: input.location,
			notes: input.notes,
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

type CloneSource = {
	id: string;
	title: string;
	gameId: string | null;
	scheduledAt: Date;
	durationMinutes: number | null;
	location: string | null;
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

	const [event] = await db
		.insert(schema.events)
		.values({
			title,
			gameId: source.gameId,
			scheduledAt,
			durationMinutes: source.durationMinutes,
			location: source.location,
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
			location: schema.events.location,
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

/**
 * Wrap up a session: record who actually showed up (checkbox per approved
 * member), optionally update the recap notes, and mark the event completed.
 */
export async function recordAttendance(eventId: string, formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const db = getDb();

	const [event] = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			gameId: schema.events.gameId,
			scheduledAt: schema.events.scheduledAt,
			durationMinutes: schema.events.durationMinutes,
			location: schema.events.location,
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

	const notes = String(formData.get("notes") ?? "").trim();
	await db
		.update(schema.events)
		.set({
			status: "completed",
			...(notes ? { notes } : {}),
			updatedAt: new Date(),
		})
		.where(eq(schema.events.id, eventId));

	// "Same time next week" checkbox on the wrap-up form — one round-trip.
	if (formData.get("scheduleNext")) {
		await cloneEventForward(db, user, event);
	}

	revalidatePath("/events");
	revalidatePath("/");
}
