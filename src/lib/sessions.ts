// Pure session logic — no DB, no clock except what callers pass in. Shared
// by the pages (what to show), the actions (what's allowed), and the cron
// (auto-close). "Session" is the product word; the table is still `events`.

export type SessionStatus = "scheduled" | "completed" | "cancelled";
export type Rsvp = "yes" | "maybe" | "no";
export type Visibility = "members" | "open";

/** When no length was given, treat a session as ~3h for "is it live?". */
export const DEFAULT_SESSION_MINUTES = 180;
/** Past its end by this much with no wrap-up → the cron closes it. */
export const AUTO_CLOSE_AFTER_MS = 48 * 60 * 60 * 1000;
/** How far in the past a new/edited start may be — "now" typed a minute late. */
export const START_GRACE_MS = 30 * 60 * 1000;

export type SessionTiming = {
	status: SessionStatus;
	scheduledAt: Date;
	durationMinutes: number | null;
};

/**
 * - upcoming: scheduled, not started
 * - live: scheduled, between start and end
 * - ended: scheduled but over — waiting for a wrap-up (or the auto-close)
 * - completed / cancelled: closed out
 */
export type SessionPhase = "upcoming" | "live" | "ended" | "completed" | "cancelled";

export function sessionEndsAt(session: Pick<SessionTiming, "scheduledAt" | "durationMinutes">): Date {
	const minutes = session.durationMinutes ?? DEFAULT_SESSION_MINUTES;
	return new Date(session.scheduledAt.getTime() + minutes * 60_000);
}

export function sessionPhase(session: SessionTiming, now: Date): SessionPhase {
	if (session.status === "completed") return "completed";
	if (session.status === "cancelled") return "cancelled";
	if (now < session.scheduledAt) return "upcoming";
	if (now < sessionEndsAt(session)) return "live";
	return "ended";
}

/** RSVPs stay open until the session ends — people hop into live ones. */
export function canRsvp(phase: SessionPhase): boolean {
	return phase === "upcoming" || phase === "live";
}

/** Wrap-up is for sessions that have at least started. */
export function canWrapUp(phase: SessionPhase): boolean {
	return phase === "live" || phase === "ended";
}

export function isAutoCloseDue(session: SessionTiming, now: Date): boolean {
	return (
		session.status === "scheduled" &&
		now.getTime() >= sessionEndsAt(session).getTime() + AUTO_CLOSE_AFTER_MS
	);
}

export type RosterEntry = {
	userId: string;
	name: string;
	image?: string | null;
	rsvp: Rsvp | null;
	attended: boolean | null;
	isGuest?: boolean;
};

export type RosterSummary = {
	going: RosterEntry[];
	maybe: RosterEntry[];
	out: RosterEntry[];
	came: RosterEntry[];
	/** null = no cap. */
	spotsLeft: number | null;
	full: boolean;
};

export function summarizeRoster(roster: RosterEntry[], capacity: number | null): RosterSummary {
	const going = roster.filter((entry) => entry.rsvp === "yes");
	const spotsLeft = capacity === null ? null : Math.max(0, capacity - going.length);
	return {
		going,
		maybe: roster.filter((entry) => entry.rsvp === "maybe"),
		out: roster.filter((entry) => entry.rsvp === "no"),
		came: roster.filter((entry) => entry.attended === true),
		spotsLeft,
		full: spotsLeft === 0,
	};
}

/** Who may edit or cancel: the host or an admin (owner's decision, 2026-09). */
export function canManageSession(
	session: { createdBy: string | null },
	viewer: { id: string; role: string }
): boolean {
	return viewer.role === "admin" || (session.createdBy !== null && session.createdBy === viewer.id);
}

/**
 * Guests only ever see open sessions; members see everything. The single
 * visibility rule — pages, actions, calendar feeds, and Discord all use it.
 */
export function canSeeSession(visibility: Visibility, viewer: { role: string }): boolean {
	return visibility === "open" || viewer.role === "admin" || viewer.role === "member";
}

/** A title when the poster didn't type one: the game, else a generic night. */
export function defaultSessionTitle(gameTitle: string | null | undefined): string {
	return gameTitle?.trim() || "Game night";
}

/** "Session 12" → 12 — seeds session_number from a typed title. */
export function trailingNumber(title: string): number | undefined {
	const match = title.match(/(\d+)\s*$/);
	return match ? Number(match[1]) : undefined;
}

/** "Session 12" → "Session 13"; titles without a trailing number are copied. */
export function bumpTrailingNumber(title: string): string {
	return title.replace(/(\d+)\s*$/, (match) => String(Number(match) + 1));
}

/** "180" → "3h", "90" → "1h 30m", null → null. */
export function formatDuration(minutes: number | null): string | null {
	if (!minutes || minutes <= 0) return null;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest}m`;
	return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Only http(s) links are ever rendered as join links. */
export function safeJoinUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
	} catch {
		return null;
	}
}
