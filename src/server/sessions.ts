"use server";

// Session actions — the heart of the app. Every export is a public POST
// endpoint, so each re-checks: the caller's tier (guest vs member), the
// session's visibility (guests only ever touch open sessions), host-or-admin
// for edit/cancel, and the session's phase (no RSVPs to a finished night).

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { isUuid } from "@/lib/ids";
import {
	bumpTrailingNumber,
	canManageSession,
	canRsvp,
	canSeeSession,
	canWrapUp,
	defaultSessionTitle,
	sessionPhase,
	START_GRACE_MS,
	trailingNumber,
	type Rsvp,
} from "@/lib/sessions";
import { discordTimestamp, md, syncSessionAnnouncement } from "@/server/discord";
import { resolveOrCreateGame } from "@/server/game-linking";
import { requireCircleUser, requireMember, type SessionUser } from "@/server/session";

const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((value) => (value ? value : undefined));

const sessionFields = z.object({
	title: optionalText(200),
	gameId: z.string().uuid().optional(),
	// Typed-in title: links an existing game by name or adds a minimal one.
	newGameTitle: optionalText(200),
	// ISO instant — the browser converts local time (the server runs in UTC).
	startsAt: z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), "Pick a time."),
	durationMinutes: z.coerce.number().int().min(15).max(24 * 60).optional(),
	visibility: z.enum(["members", "open"]),
	capacity: z.coerce.number().int().min(2).max(100).optional(),
	location: optionalText(300),
	joinUrl: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((value) => (value ? value : undefined))
		.refine((value) => !value || /^https?:\/\//i.test(value), "Join links must start with https://"),
	notes: optionalText(2000),
	venue: z.enum(["virtual", "in_person", "hybrid"]).optional(),
});

function readSessionForm(formData: FormData) {
	const get = (key: string) => {
		const value = formData.get(key);
		return value === null || value === "" ? undefined : String(value);
	};
	const parsed = sessionFields.safeParse({
		title: get("title"),
		gameId: get("gameId"),
		newGameTitle: get("newGameTitle"),
		startsAt: get("startsAt"),
		durationMinutes: get("durationMinutes"),
		visibility: get("visibility") ?? "members",
		capacity: get("capacity"),
		location: get("location"),
		joinUrl: get("joinUrl"),
		notes: get("notes"),
		venue: get("venue"),
	});
	// First issue as a plain Error so forms show a readable line.
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	const input = parsed.data;
	const now = Date.now();
	if (input.startsAt.getTime() < now - START_GRACE_MS) throw new Error("That time is in the past.");
	if (input.startsAt.getTime() > now + MAX_AHEAD_MS) throw new Error("Pick a time within the next year.");
	return input;
}

async function resolveGame(
	db: ReturnType<typeof getDb>,
	user: SessionUser,
	input: { gameId?: string; newGameTitle?: string }
): Promise<{ id: string | null; title: string | null }> {
	const id = input.newGameTitle
		? await resolveOrCreateGame(db, user, input.newGameTitle, "a posted session")
		: (input.gameId ?? null);
	if (!id) return { id: null, title: null };
	const [game] = await db
		.select({ title: schema.games.title })
		.from(schema.games)
		.where(eq(schema.games.id, id));
	if (!game) throw new Error("That game isn't in the library anymore.");
	return { id, title: game.title };
}

function revalidateSessions(eventId?: string) {
	revalidatePath("/");
	revalidatePath("/sessions");
	if (eventId) revalidatePath(`/s/${eventId}`);
}

/** Post a session. Members only; the host is automatically in. */
export async function createSession(formData: FormData): Promise<{ id: string }> {
	const user = await requireMember("/sessions/new");
	const input = readSessionForm(formData);
	const db = getDb();
	const game = await resolveGame(db, user, input);
	const title = input.title ?? defaultSessionTitle(game.title);

	const id = crypto.randomUUID();
	// Atomic: a session never exists without its host's RSVP.
	await db.batch([
		db.insert(schema.events).values({
			id,
			title,
			gameId: game.id,
			scheduledAt: input.startsAt,
			durationMinutes: input.durationMinutes,
			visibility: input.visibility,
			capacity: input.capacity,
			location: input.location,
			joinUrl: input.joinUrl,
			notes: input.notes,
			venue: input.venue,
			sessionNumber: trailingNumber(title),
			createdBy: user.id,
		}),
		db.insert(schema.eventAttendance).values({ eventId: id, userId: user.id, rsvp: "yes" }),
	]);

	syncSessionAnnouncement(id);
	revalidateSessions(id);
	return { id };
}

type ManagedSession = typeof schema.events.$inferSelect;

async function loadManageable(eventId: string, user: SessionUser): Promise<ManagedSession> {
	if (!isUuid(eventId)) throw new Error("Session not found.");
	const db = getDb();
	const [session] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
	if (!session) throw new Error("Session not found.");
	if (!canManageSession(session, user)) throw new Error("Only the host or an admin can change this session.");
	return session;
}

/** Edit a scheduled session — host or admin. */
export async function updateSession(eventId: string, formData: FormData): Promise<void> {
	const user = await requireMember(`/s/${eventId}/edit`);
	const session = await loadManageable(eventId, user);
	if (session.status !== "scheduled") throw new Error("This session is already closed.");
	const input = readSessionForm(formData);
	const db = getDb();
	const game = await resolveGame(db, user, input);
	const moved = input.startsAt.getTime() !== session.scheduledAt.getTime();

	await db
		.update(schema.events)
		.set({
			title: input.title ?? defaultSessionTitle(game.title),
			gameId: game.id,
			scheduledAt: input.startsAt,
			durationMinutes: input.durationMinutes ?? null,
			visibility: input.visibility,
			capacity: input.capacity ?? null,
			location: input.location ?? null,
			joinUrl: input.joinUrl ?? null,
			notes: input.notes ?? null,
			venue: input.venue ?? null,
			// A new time means new reminders.
			...(moved ? { reminder24hSentAt: null, reminder1hSentAt: null, wrapUpNudgeSentAt: null } : {}),
			updatedAt: new Date(),
		})
		.where(eq(schema.events.id, eventId));

	const title = input.title ?? defaultSessionTitle(game.title);
	syncSessionAnnouncement(
		eventId,
		moved ? (link) => `🕒 **${md(title)}** moved to ${discordTimestamp(input.startsAt)} — ${link}` : undefined
	);
	revalidateSessions(eventId);
}

/** Cancel a scheduled session — host or admin. */
export async function cancelSession(eventId: string): Promise<void> {
	const user = await requireMember(`/s/${eventId}`);
	const session = await loadManageable(eventId, user);
	if (session.status !== "scheduled") throw new Error("Only upcoming sessions can be cancelled.");
	await getDb()
		.update(schema.events)
		.set({ status: "cancelled", updatedAt: new Date() })
		.where(and(eq(schema.events.id, eventId), eq(schema.events.status, "scheduled")));
	syncSessionAnnouncement(eventId, (link) => `❌ **${md(session.title)}** is cancelled — ${link}`);
	revalidateSessions(eventId);
}

/**
 * I'm in / maybe / out. Guests may RSVP to open sessions only. A capped
 * session admits "in" atomically: the insert only happens while there's a
 * free seat, so two last-second joins can't both take the final spot.
 */
export async function setSessionRsvp(eventId: string, rsvp: Rsvp): Promise<void> {
	const user = await requireCircleUser(`/s/${eventId}`);
	if (!isUuid(eventId)) throw new Error("Session not found.");
	if (rsvp !== "yes" && rsvp !== "maybe" && rsvp !== "no") throw new Error("Invalid RSVP.");
	const db = getDb();
	const [session] = await db
		.select({
			status: schema.events.status,
			scheduledAt: schema.events.scheduledAt,
			durationMinutes: schema.events.durationMinutes,
			visibility: schema.events.visibility,
			capacity: schema.events.capacity,
		})
		.from(schema.events)
		.where(eq(schema.events.id, eventId));
	// Invisible and missing look the same to a guest.
	if (!session || !canSeeSession(session.visibility, user)) throw new Error("Session not found.");
	if (!canRsvp(sessionPhase(session, new Date()))) throw new Error("This session is over — RSVPs are closed.");

	if (rsvp === "yes" && session.capacity !== null) {
		const joined = await db.execute(sql`
			insert into ${schema.eventAttendance} (event_id, user_id, rsvp, responded_at)
			select ${eventId}::uuid, ${user.id}::text, 'yes'::rsvp_status, now()
			where (
				select count(*) from ${schema.eventAttendance}
				where event_id = ${eventId}::uuid and rsvp = 'yes' and user_id <> ${user.id}::text
			) < ${session.capacity}
			on conflict (event_id, user_id) do update set rsvp = 'yes', responded_at = now()
			returning user_id
		`);
		if (joined.rows.length === 0) throw new Error("It's full — try Maybe and the host will see you.");
	} else {
		await db
			.insert(schema.eventAttendance)
			.values({ eventId, userId: user.id, rsvp, respondedAt: new Date() })
			.onConflictDoUpdate({
				target: [schema.eventAttendance.eventId, schema.eventAttendance.userId],
				set: { rsvp, respondedAt: new Date() },
			});
	}

	syncSessionAnnouncement(eventId);
	revalidateSessions(eventId);
}

const wrapUpSchema = z.object({
	// What was actually played — defaults to the plan; "" clears it.
	gameId: z.string().uuid().optional(),
	newGameTitle: optionalText(200),
	recap: optionalText(2000),
	howItWent: z.coerce.number().int().min(1).max(5).optional(),
	progressNote: optionalText(2000),
});

/**
 * The 10-second wrap-up: who came (pre-ticked from "in"), how it went, a
 * line of recap, and optionally the same time next week. Host, admin, or a
 * member who was in. Writes the recap to its own column (planning notes
 * survive) and records everything in one transaction.
 */
export async function wrapUpSession(eventId: string, formData: FormData): Promise<{ nextId?: string }> {
	const user = await requireMember(`/s/${eventId}`);
	if (!isUuid(eventId)) throw new Error("Session not found.");
	const get = (key: string) => {
		const value = formData.get(key);
		return value === null || value === "" ? undefined : String(value);
	};
	const parsed = wrapUpSchema.safeParse({
		gameId: get("gameId"),
		newGameTitle: get("newGameTitle"),
		recap: get("recap"),
		howItWent: get("howItWent"),
		progressNote: get("progressNote"),
	});
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	const input = parsed.data;

	const db = getDb();
	const [session] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
	if (!session) throw new Error("Session not found.");
	if (!canWrapUp(sessionPhase(session, new Date()))) {
		throw new Error(session.status === "scheduled" ? "It hasn't started yet." : "Already wrapped up.");
	}
	const roster = await db
		.select({ userId: schema.eventAttendance.userId, rsvp: schema.eventAttendance.rsvp })
		.from(schema.eventAttendance)
		.where(eq(schema.eventAttendance.eventId, eventId));
	const wasIn = roster.some((row) => row.userId === user.id && row.rsvp === "yes");
	if (!canManageSession(session, user) && !wasIn) {
		throw new Error("The host, an admin, or someone who was in can wrap this up.");
	}

	// Candidates: everyone with a row on this session plus every member (a
	// walk-in can be ticked). Checkbox values outside that set are ignored.
	const members = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(and(eq(schema.user.status, "approved"), inArray(schema.user.role, ["admin", "member"])));
	const candidates = new Set([...roster.map((row) => row.userId), ...members.map((m) => m.id)]);
	const attended = new Set(formData.getAll("attended").map(String).filter((id) => candidates.has(id)));

	const playedGameId = input.newGameTitle
		? await resolveOrCreateGame(db, user, input.newGameTitle, `the wrap-up of “${session.title}”`)
		: (input.gameId ?? null);
	const now = new Date();

	const closeOut = db
		.update(schema.events)
		.set({
			status: "completed",
			gameId: playedGameId,
			recap: input.recap ?? null,
			howItWent: input.howItWent ?? null,
			progressNote: input.progressNote ?? null,
			wrappedUpAt: now,
			wrappedUpBy: user.id,
			updatedAt: now,
		})
		.where(and(eq(schema.events.id, eventId), eq(schema.events.status, "scheduled")));
	const attendance = [...candidates].map((userId) =>
		db
			.insert(schema.eventAttendance)
			.values({ eventId, userId, attended: attended.has(userId) })
			.onConflictDoUpdate({
				target: [schema.eventAttendance.eventId, schema.eventAttendance.userId],
				set: { attended: attended.has(userId) },
			})
	);
	// One transaction: status, recap, and every attendance row land together.
	await db.batch([closeOut, ...attendance]);

	syncSessionAnnouncement(eventId);
	let nextId: string | undefined;
	if (formData.get("scheduleNext")) {
		nextId = await cloneForward(db, user, { ...session, gameId: playedGameId });
	}
	revalidateSessions(eventId);
	return { nextId };
}

/**
 * "Same time next week" — clone-forward, not a recurrence engine
 * (docs/DECISIONS.md): +7 days, same game/length/visibility/cap/where,
 * trailing session number bumped. Only the caller is RSVP'd.
 */
async function cloneForward(
	db: ReturnType<typeof getDb>,
	user: SessionUser,
	source: ManagedSession
): Promise<string> {
	const id = crypto.randomUUID();
	const currentNumber = source.sessionNumber ?? trailingNumber(source.title);
	await db.batch([
		db.insert(schema.events).values({
			id,
			title: bumpTrailingNumber(source.title),
			gameId: source.gameId,
			// A pure +7d offset keeps weekday and time in every timezone
			// (DST shifts the wall-clock hour at most).
			scheduledAt: new Date(source.scheduledAt.getTime() + 7 * 24 * 60 * 60 * 1000),
			durationMinutes: source.durationMinutes,
			visibility: source.visibility,
			capacity: source.capacity,
			venue: source.venue,
			location: source.location,
			joinUrl: source.joinUrl,
			sessionNumber: currentNumber !== undefined ? currentNumber + 1 : undefined,
			createdBy: user.id,
		}),
		db.insert(schema.eventAttendance).values({ eventId: id, userId: user.id, rsvp: "yes" }),
	]);
	syncSessionAnnouncement(id);
	return id;
}

/** "Play again next week" from any session page. Members only. */
export async function scheduleNextSession(eventId: string): Promise<{ id: string }> {
	const user = await requireMember(`/s/${eventId}`);
	if (!isUuid(eventId)) throw new Error("Session not found.");
	const db = getDb();
	const [source] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
	if (!source) throw new Error("Session not found.");
	const id = await cloneForward(db, user, source);
	revalidateSessions(id);
	return { id };
}
