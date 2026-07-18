// Minimal RFC 5545 calendar feed (issue #24): pure string building, tested
// in ical.test.ts. The route handler (src/app/api/calendar/route.ts) feeds
// it event rows; members subscribe once from Google/Apple Calendar and
// sessions show up where they already look.

export type CalendarFeedEvent = {
	id: string;
	title: string;
	startsAt: Date;
	/** Null falls back to DEFAULT_DURATION_MINUTES so blocks look sensible. */
	durationMinutes: number | null;
	location: string | null;
	description: string | null;
	/** Bumps DTSTAMP so subscribed copies pick up reschedules/edits. */
	updatedAt: Date;
	cancelled?: boolean;
};

export const DEFAULT_DURATION_MINUTES = 120;

/** RFC 5545 3.3.11: backslash, semicolon, comma, and newlines are escaped. */
export function escapeIcalText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r\n|\r|\n/g, "\\n");
}

/** UTC basic format: 20260717T193000Z. */
export function formatIcalDate(date: Date): string {
	return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** RFC 5545 3.1: content lines fold at 75 octets with CRLF + single space.
 * Folding at 74 UTF-16 units keeps multi-byte text safely under the octet
 * cap for the characters this app realistically emits. */
function foldLine(line: string): string {
	if (line.length <= 74) return line;
	const parts: string[] = [line.slice(0, 74)];
	for (let i = 74; i < line.length; i += 73) {
		parts.push(` ${line.slice(i, i + 73)}`);
	}
	return parts.join("\r\n");
}

export function buildCalendar(events: CalendarFeedEvent[], options: { name: string }): string {
	const lines: string[] = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//NextQuest//events//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${escapeIcalText(options.name)}`,
	];

	for (const event of events) {
		const startMs = event.startsAt.getTime();
		const endMs = startMs + (event.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60 * 1000;
		lines.push(
			"BEGIN:VEVENT",
			// Stable UID = same event across refreshes; DTSTAMP from updatedAt
			// tells clients which copy is newer.
			`UID:${event.id}@nextquest`,
			`DTSTAMP:${formatIcalDate(event.updatedAt)}`,
			`DTSTART:${formatIcalDate(event.startsAt)}`,
			`DTEND:${formatIcalDate(new Date(endMs))}`,
			`SUMMARY:${escapeIcalText(event.title)}`,
			`STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`
		);
		if (event.location) lines.push(`LOCATION:${escapeIcalText(event.location)}`);
		if (event.description) lines.push(`DESCRIPTION:${escapeIcalText(event.description)}`);
		lines.push("END:VEVENT");
	}

	lines.push("END:VCALENDAR");
	// RFC 5545 mandates CRLF line endings, plus a trailing newline.
	return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Feed token, derived from BETTER_AUTH_SECRET so no new secret is needed and
 * every deployment gets a stable, unguessable URL. Calendar apps can't send
 * cookies, so the URL itself is the credential — anyone holding it can read
 * event titles/times, which is the documented trade-off for a single-tenant
 * friend group (rotate BETTER_AUTH_SECRET to revoke).
 */
export async function deriveCalendarToken(secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode("nextquest-ical-feed-v1")
	);
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 32);
}
