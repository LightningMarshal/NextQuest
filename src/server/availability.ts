"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { covers, mergeIntervals, overlaps, type Interval } from "@/lib/availability-grid";
import { discordTimestamp, notifyDiscord } from "@/lib/discord";
import { resolveOrCreateGame } from "@/server/game-linking";
import { requireApprovedUser } from "@/server/session";

type AvailabilityResponse = (typeof schema.availabilityResponseValue.enumValues)[number];

const createPollSchema = z.object({
	title: z.string().trim().min(1, "Title is required").max(200),
	durationMinutes: z.coerce
		.number()
		.int()
		.positive()
		.max(24 * 60)
		.multipleOf(15, "Session length uses 15-minute increments."),
	// ISO instants, converted from datetime-local in the browser.
	slotStarts: z
		.array(
			z.coerce
				.date()
				.refine((d) => d.getTime() > Date.now(), "Slots must be in the future.")
				// Every real UTC offset is a multiple of 15 min, so UTC alignment
				// ⇔ local alignment; datetime-local never carries seconds.
				.refine(
					(d) => d.getUTCMinutes() % 15 === 0 && d.getUTCSeconds() === 0,
					"Slot times use 15-minute increments."
				)
		)
		.min(1, "Add at least one time slot")
		.max(20),
});

export async function createAvailabilityPoll(formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const parsed = createPollSchema.safeParse({
		title: formData.get("title"),
		durationMinutes: formData.get("durationMinutes"),
		slotStarts: formData.getAll("slotStart"),
	});
	// First issue as a plain Error so the form shows a readable message
	// instead of a ZodError JSON blob.
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	const input = parsed.data;

	const db = getDb();
	const [poll] = await db
		.insert(schema.availabilityPolls)
		.values({ title: input.title, createdBy: user.id })
		.returning({ id: schema.availabilityPolls.id });

	await db.insert(schema.availabilityOptions).values(
		input.slotStarts.map((startsAt) => ({
			pollId: poll.id,
			startsAt,
			endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
		}))
	);

	// The proposer can presumably make their own slots.
	const options = await db
		.select({ id: schema.availabilityOptions.id })
		.from(schema.availabilityOptions)
		.where(eq(schema.availabilityOptions.pollId, poll.id));
	await db.insert(schema.availabilityResponses).values(
		options.map((option) => ({ optionId: option.id, userId: user.id, response: "yes" as const }))
	);

	revalidatePath("/events");
}

// --- Grid polls (issue #33, whenisgood-style) -------------------------------

const quarterAligned = (d: Date) => d.getUTCMinutes() % 15 === 0 && d.getUTCSeconds() === 0;

const createGridPollSchema = z.object({
	title: z.string().trim().min(1, "Title is required").max(200),
	// What the poll is trying to schedule (#37): an existing game, or a typed
	// title that links/creates one (same rule as the wrap-up, issue #32).
	gameId: z.string().uuid().optional(),
	newGameTitle: z.string().trim().min(1).max(200).optional(),
	sessionMinutes: z.coerce
		.number()
		.int()
		.min(30)
		.max(24 * 60)
		.multipleOf(15, "Session length uses 15-minute increments."),
	// Day-windows as ISO instant pairs, converted from the creator's local
	// times in the browser.
	windows: z
		.array(
			z
				.object({ start: z.coerce.date(), end: z.coerce.date() })
				.refine((w) => w.end.getTime() > w.start.getTime(), "Window end must be after start.")
				.refine((w) => quarterAligned(w.start) && quarterAligned(w.end), {
					message: "Windows use 15-minute increments.",
				})
				.refine((w) => w.end.getTime() - w.start.getTime() <= 24 * 60 * 60_000, {
					message: "A window can span at most a day.",
				})
		)
		.min(1, "Add at least one day.")
		.max(14, "At most 14 days per poll."),
});

/** Create a paint-the-grid poll: title + day-windows (options rows). */
export async function createGridPoll(input: {
	title: string;
	gameId?: string;
	newGameTitle?: string;
	sessionMinutes: number;
	windows: { start: string; end: string }[];
}): Promise<void> {
	const user = await requireApprovedUser();
	const parsed = createGridPollSchema.safeParse(input);
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	const { title, sessionMinutes, windows } = parsed.data;
	if (windows.some((w) => w.end.getTime() - w.start.getTime() < sessionMinutes * 60_000)) {
		throw new Error("Each day's window must be at least as long as the session.");
	}
	if (windows.some((w) => w.end.getTime() < Date.now())) {
		throw new Error("Windows must be in the future.");
	}

	const db = getDb();
	// Typed title wins over the select, mirroring the wrap-up (#32).
	const gameId = parsed.data.newGameTitle
		? await resolveOrCreateGame(db, user, parsed.data.newGameTitle, `the “${title}” poll`)
		: (parsed.data.gameId ?? null);
	let gameTitle: string | null = null;
	if (gameId) {
		const [game] = await db
			.select({ title: schema.games.title })
			.from(schema.games)
			.where(eq(schema.games.id, gameId));
		if (!game) throw new Error("Game not found.");
		gameTitle = game.title;
	}

	const [poll] = await db
		.insert(schema.availabilityPolls)
		.values({ title, kind: "grid", gridSessionMinutes: sessionMinutes, gameId, createdBy: user.id })
		.returning({ id: schema.availabilityPolls.id });
	await db.insert(schema.availabilityOptions).values(
		windows.map((window) => ({ pollId: poll.id, startsAt: window.start, endsAt: window.end }))
	);

	notifyDiscord(
		`🗓️ ${user.name} opened **${title}**${gameTitle ? ` (${gameTitle})` : ""} — paint the times that work on the events page`
	);
	revalidatePath("/events");
}

/**
 * Delete a closed poll outright (#37) — the creator or an admin, once it's
 * closed. Marks/options/responses cascade; a scheduled event just loses its
 * poll back-reference (set null).
 */
export async function deletePoll(pollId: string): Promise<void> {
	const user = await requireApprovedUser();
	const db = getDb();
	const [poll] = await db
		.select({
			status: schema.availabilityPolls.status,
			createdBy: schema.availabilityPolls.createdBy,
		})
		.from(schema.availabilityPolls)
		.where(eq(schema.availabilityPolls.id, pollId));
	if (!poll) throw new Error("Poll not found.");
	if (poll.status !== "closed") throw new Error("Close the poll before deleting it.");
	if (poll.createdBy !== user.id && user.role !== "admin") {
		throw new Error("Only the poll's creator or an admin can delete it.");
	}
	await db.delete(schema.availabilityPolls).where(eq(schema.availabilityPolls.id, pollId));
	revalidatePath("/events");
}

const saveAvailabilitySchema = z.object({
	pollId: z.string().uuid(),
	intervals: z
		.array(
			z
				.object({ start: z.coerce.date(), end: z.coerce.date() })
				.refine((i) => i.end.getTime() > i.start.getTime(), "Empty interval.")
				.refine((i) => quarterAligned(i.start) && quarterAligned(i.end), {
					message: "Marks use 15-minute increments.",
				})
		)
		.max(200, "Too many marks."),
});

/**
 * Replace the calling member's painted availability for a grid poll.
 * Full-ballot replace (delete + insert) — the grid always submits everything
 * it shows, so partial updates can't strand stale stretches.
 */
export async function saveAvailability(
	pollId: string,
	intervals: { start: string; end: string }[]
): Promise<void> {
	const user = await requireApprovedUser();
	const parsed = saveAvailabilitySchema.safeParse({ pollId, intervals });
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);

	const db = getDb();
	const [poll] = await db
		.select({ status: schema.availabilityPolls.status, kind: schema.availabilityPolls.kind })
		.from(schema.availabilityPolls)
		.where(eq(schema.availabilityPolls.id, parsed.data.pollId));
	if (!poll || poll.kind !== "grid") throw new Error("Poll not found.");
	if (poll.status !== "open") throw new Error("This poll is closed.");

	const windows = await db
		.select({ startsAt: schema.availabilityOptions.startsAt, endsAt: schema.availabilityOptions.endsAt })
		.from(schema.availabilityOptions)
		.where(eq(schema.availabilityOptions.pollId, parsed.data.pollId));
	const merged = mergeIntervals(
		parsed.data.intervals.map((i) => ({ startsAt: i.start, endsAt: i.end }))
	);
	// Every painted stretch must sit inside one of the poll's day-windows —
	// the grid can't produce anything else, so out-of-window marks are junk.
	for (const mark of merged) {
		if (!covers(windows, mark.startsAt, mark.endsAt)) {
			throw new Error("Marks must stay inside the poll's windows.");
		}
	}

	// No transactions on the Neon HTTP driver: delete-then-insert has a brief
	// empty window, acceptable at friend-group scale and idempotent on retry.
	await db
		.delete(schema.availabilityMarks)
		.where(
			and(
				eq(schema.availabilityMarks.pollId, parsed.data.pollId),
				eq(schema.availabilityMarks.userId, user.id)
			)
		);
	if (merged.length > 0) {
		await db.insert(schema.availabilityMarks).values(
			merged.map((mark) => ({
				pollId: parsed.data.pollId,
				userId: user.id,
				startsAt: mark.startsAt,
				endsAt: mark.endsAt,
			}))
		);
	}
	revalidatePath("/events");
}

/**
 * The grid poll's payoff: schedule a suggested (or hand-picked) span as an
 * event. RSVPs seed from painted marks: full cover → yes, partial → maybe,
 * painted elsewhere only → no. Closes the poll.
 */
export async function scheduleGridWindow(
	pollId: string,
	startIso: string,
	endIso: string
): Promise<void> {
	const user = await requireApprovedUser();
	const start = new Date(startIso);
	const end = new Date(endIso);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
		throw new Error("Invalid window.");
	}
	if (!quarterAligned(start) || !quarterAligned(end)) {
		throw new Error("Windows use 15-minute increments.");
	}

	const db = getDb();
	const [poll] = await db
		.select({
			title: schema.availabilityPolls.title,
			status: schema.availabilityPolls.status,
			kind: schema.availabilityPolls.kind,
			gameId: schema.availabilityPolls.gameId,
		})
		.from(schema.availabilityPolls)
		.where(eq(schema.availabilityPolls.id, pollId));
	if (!poll || poll.kind !== "grid") throw new Error("Poll not found.");
	if (poll.status !== "open") throw new Error("This poll is already closed.");

	const windows = await db
		.select({ startsAt: schema.availabilityOptions.startsAt, endsAt: schema.availabilityOptions.endsAt })
		.from(schema.availabilityOptions)
		.where(eq(schema.availabilityOptions.pollId, pollId));
	if (!covers(windows, start, end)) {
		throw new Error("That span is outside the poll's windows.");
	}

	const [event] = await db
		.insert(schema.events)
		.values({
			title: poll.title,
			// The poll's game rides along onto the session (#37).
			gameId: poll.gameId,
			scheduledAt: start,
			durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
			availabilityPollId: pollId,
			createdBy: user.id,
		})
		.returning({ id: schema.events.id });

	const marks = await db
		.select({
			userId: schema.availabilityMarks.userId,
			startsAt: schema.availabilityMarks.startsAt,
			endsAt: schema.availabilityMarks.endsAt,
		})
		.from(schema.availabilityMarks)
		.where(eq(schema.availabilityMarks.pollId, pollId));
	const byUser = new Map<string, Interval[]>();
	for (const mark of marks) {
		const list = byUser.get(mark.userId) ?? [];
		list.push({ startsAt: mark.startsAt, endsAt: mark.endsAt });
		byUser.set(mark.userId, list);
	}
	if (byUser.size > 0) {
		await db.insert(schema.eventAttendance).values(
			[...byUser.entries()].map(([userId, intervals]) => ({
				eventId: event.id,
				userId,
				rsvp: covers(intervals, start, end)
					? ("yes" as const)
					: overlaps(intervals, start, end)
						? ("maybe" as const)
						: ("no" as const),
			}))
		);
	}

	await db
		.update(schema.availabilityPolls)
		.set({ status: "closed", closedAt: new Date() })
		.where(eq(schema.availabilityPolls.id, pollId));

	notifyDiscord(
		`📅 **${poll.title}** is happening ${discordTimestamp(start)} — the grid picked its winner`
	);
	revalidatePath("/events");
	revalidatePath("/");
}

/** Upsert the calling member's response for one slot. Public, like RSVPs. */
export async function respondToSlot(
	optionId: string,
	response: AvailabilityResponse
): Promise<void> {
	const user = await requireApprovedUser();
	if (!schema.availabilityResponseValue.enumValues.includes(response)) {
		throw new Error("Invalid response.");
	}

	const db = getDb();
	const [option] = await db
		.select({ pollStatus: schema.availabilityPolls.status })
		.from(schema.availabilityOptions)
		.innerJoin(
			schema.availabilityPolls,
			eq(schema.availabilityOptions.pollId, schema.availabilityPolls.id)
		)
		.where(eq(schema.availabilityOptions.id, optionId));
	if (!option) throw new Error("Slot not found.");
	if (option.pollStatus !== "open") throw new Error("This poll is closed.");

	await db
		.insert(schema.availabilityResponses)
		.values({ optionId, userId: user.id, response, respondedAt: new Date() })
		.onConflictDoUpdate({
			target: [schema.availabilityResponses.optionId, schema.availabilityResponses.userId],
			set: { response, respondedAt: new Date() },
		});

	revalidatePath("/events");
}

export async function closePoll(pollId: string): Promise<void> {
	await requireApprovedUser();
	const db = getDb();
	await db
		.update(schema.availabilityPolls)
		.set({ status: "closed", closedAt: new Date() })
		.where(eq(schema.availabilityPolls.id, pollId));
	revalidatePath("/events");
}

/**
 * The payoff: turn a slot into a scheduled event. Seeds RSVPs from the
 * slot's responses (yes → yes, if-need-be → maybe, no → no) and closes the
 * poll.
 */
export async function createEventFromSlot(optionId: string): Promise<void> {
	const user = await requireApprovedUser();
	const db = getDb();

	const [slot] = await db
		.select({
			startsAt: schema.availabilityOptions.startsAt,
			endsAt: schema.availabilityOptions.endsAt,
			pollId: schema.availabilityPolls.id,
			pollTitle: schema.availabilityPolls.title,
			pollStatus: schema.availabilityPolls.status,
		})
		.from(schema.availabilityOptions)
		.innerJoin(
			schema.availabilityPolls,
			eq(schema.availabilityOptions.pollId, schema.availabilityPolls.id)
		)
		.where(eq(schema.availabilityOptions.id, optionId));
	if (!slot) throw new Error("Slot not found.");
	if (slot.pollStatus !== "open") throw new Error("This poll is already closed.");

	const [event] = await db
		.insert(schema.events)
		.values({
			title: slot.pollTitle,
			scheduledAt: slot.startsAt,
			durationMinutes: Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000),
			availabilityPollId: slot.pollId,
			createdBy: user.id,
		})
		.returning({ id: schema.events.id });

	const responses = await db
		.select({
			userId: schema.availabilityResponses.userId,
			response: schema.availabilityResponses.response,
		})
		.from(schema.availabilityResponses)
		.where(eq(schema.availabilityResponses.optionId, optionId));

	const toRsvp = { yes: "yes", if_need_be: "maybe", no: "no" } as const;
	if (responses.length > 0) {
		await db.insert(schema.eventAttendance).values(
			responses.map((row) => ({
				eventId: event.id,
				userId: row.userId,
				rsvp: toRsvp[row.response],
			}))
		);
	}

	await db
		.update(schema.availabilityPolls)
		.set({ status: "closed", closedAt: new Date() })
		.where(eq(schema.availabilityPolls.id, slot.pollId));

	notifyDiscord(
		`📅 **${slot.pollTitle}** is happening ${discordTimestamp(slot.startsAt)} — the poll picked its winner`
	);
	revalidatePath("/events");
	revalidatePath("/");
}
