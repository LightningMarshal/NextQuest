"use server";

import type { rsvpStatus } from "@/db/schema";

type Rsvp = (typeof rsvpStatus.enumValues)[number];

// TODO(Phase 5): create/update/cancel events.
export async function createEvent(_input: {
	title: string;
	gameId?: string;
	scheduledAt: string; // ISO datetime
	durationMinutes?: number;
	location?: string;
	notes?: string;
}): Promise<{ eventId: string }> {
	throw new Error("createEvent not implemented (Phase 5)");
}

// TODO(Phase 5): upsert the calling member's RSVP.
export async function setRsvp(_input: { eventId: string; rsvp: Rsvp }): Promise<void> {
	throw new Error("setRsvp not implemented (Phase 5)");
}

// TODO(Phase 5): record who actually showed up (admin, after the session).
export async function recordAttendance(_input: {
	eventId: string;
	attendance: { userId: string; attended: boolean }[];
}): Promise<void> {
	throw new Error("recordAttendance not implemented (Phase 5)");
}

// TODO(Phase 6 — GAC): availability polls live in their own module once the
// availability_polls/options/responses tables land. See docs/ARCHITECTURE.md.
