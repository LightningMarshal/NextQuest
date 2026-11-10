// The RSVP write, shared by the web action (setSessionRsvp) and the Discord
// bot's buttons (api/discord/interactions). Server-only, NOT "use server" —
// the caller has already established WHO is asking; this enforces what they
// may do: visibility (guests only touch open sessions), phase (no RSVPs to
// a finished night), and the seat cap.

import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { isUuid } from "@/lib/ids";
import { canRsvp, canSeeSession, sessionPhase, type Rsvp } from "@/lib/sessions";

export type RsvpResult =
	| { ok: true; title: string }
	/** not_found also covers "exists but not visible to you" — same answer. */
	| { ok: false; reason: "not_found" | "closed" | "full" };

/**
 * I'm in / maybe / out. A capped session admits "in" atomically: the insert
 * only happens while there's a free seat, so two last-second joins can't
 * both take the final spot.
 */
export async function applyRsvp(
	db: ReturnType<typeof getDb>,
	viewer: { id: string; role: string },
	eventId: string,
	rsvp: Rsvp
): Promise<RsvpResult> {
	if (!isUuid(eventId)) return { ok: false, reason: "not_found" };
	const [session] = await db
		.select({
			title: schema.events.title,
			status: schema.events.status,
			scheduledAt: schema.events.scheduledAt,
			durationMinutes: schema.events.durationMinutes,
			visibility: schema.events.visibility,
			capacity: schema.events.capacity,
		})
		.from(schema.events)
		.where(eq(schema.events.id, eventId));
	if (!session || !canSeeSession(session.visibility, viewer)) return { ok: false, reason: "not_found" };
	if (!canRsvp(sessionPhase(session, new Date()))) return { ok: false, reason: "closed" };

	if (rsvp === "yes" && session.capacity !== null) {
		const joined = await db.execute(sql`
			insert into ${schema.eventAttendance} (event_id, user_id, rsvp, responded_at)
			select ${eventId}::uuid, ${viewer.id}::text, 'yes'::rsvp_status, now()
			where (
				select count(*) from ${schema.eventAttendance}
				where event_id = ${eventId}::uuid and rsvp = 'yes' and user_id <> ${viewer.id}::text
			) < ${session.capacity}
			on conflict (event_id, user_id) do update set rsvp = 'yes', responded_at = now()
			returning user_id
		`);
		if (joined.rows.length === 0) return { ok: false, reason: "full" };
	} else {
		await db
			.insert(schema.eventAttendance)
			.values({ eventId, userId: viewer.id, rsvp, respondedAt: new Date() })
			.onConflictDoUpdate({
				target: [schema.eventAttendance.eventId, schema.eventAttendance.userId],
				set: { rsvp, respondedAt: new Date() },
			});
	}
	return { ok: true, title: session.title };
}
