// The session insert, shared by the composer (createSession) and the
// Discord bot's /post. Server-only, NOT "use server": the caller has already
// established that this person is a member and validated the input.

import { getDb, schema } from "@/db";
import { defaultSessionTitle, trailingNumber } from "@/lib/sessions";
import { syncSessionAnnouncement } from "@/server/discord";

export type NewSession = {
	title?: string;
	game: { id: string | null; title: string | null };
	startsAt: Date;
	durationMinutes?: number;
	visibility: "members" | "open";
	capacity?: number;
	location?: string;
	joinUrl?: string;
	notes?: string;
	venue?: "virtual" | "in_person" | "hybrid";
};

/**
 * Create a session with its host already in (one transaction — a session
 * never exists without its host's RSVP), and announce it on Discord.
 */
export async function insertSession(
	db: ReturnType<typeof getDb>,
	hostId: string,
	input: NewSession
): Promise<{ id: string; title: string }> {
	const title = input.title ?? defaultSessionTitle(input.game.title);
	const id = crypto.randomUUID();
	await db.batch([
		db.insert(schema.events).values({
			id,
			title,
			gameId: input.game.id,
			scheduledAt: input.startsAt,
			durationMinutes: input.durationMinutes,
			visibility: input.visibility,
			capacity: input.capacity,
			location: input.location,
			joinUrl: input.joinUrl,
			notes: input.notes,
			venue: input.venue,
			sessionNumber: trailingNumber(title),
			createdBy: hostId,
		}),
		db.insert(schema.eventAttendance).values({ eventId: id, userId: hostId, rsvp: "yes" }),
	]);
	syncSessionAnnouncement(id);
	return { id, title };
}
