"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { discordTimestamp, notifyDiscord } from "@/lib/discord";
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
		.set({ status: "closed" })
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
		.set({ status: "closed" })
		.where(eq(schema.availabilityPolls.id, slot.pollId));

	notifyDiscord(
		`📅 **${slot.pollTitle}** is happening ${discordTimestamp(slot.startsAt)} — the poll picked its winner`
	);
	revalidatePath("/events");
	revalidatePath("/");
}
