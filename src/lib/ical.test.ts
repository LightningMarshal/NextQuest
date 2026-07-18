import { describe, expect, it } from "vitest";

import {
	DEFAULT_DURATION_MINUTES,
	buildCalendar,
	deriveCalendarToken,
	escapeIcalText,
	formatIcalDate,
	type CalendarFeedEvent,
} from "./ical";

function event(overrides: Partial<CalendarFeedEvent> = {}): CalendarFeedEvent {
	return {
		id: "11111111-2222-4333-8444-555555555555",
		title: "Game Night 5",
		startsAt: new Date("2026-07-17T19:30:00Z"),
		durationMinutes: 120,
		location: "the couch",
		description: "bring snacks",
		updatedAt: new Date("2026-07-10T08:00:00Z"),
		...overrides,
	};
}

describe("escapeIcalText", () => {
	it("escapes RFC 5545 specials and newlines", () => {
		expect(escapeIcalText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
		expect(escapeIcalText("windows\r\nnewline")).toBe("windows\\nnewline");
	});
});

describe("formatIcalDate", () => {
	it("emits UTC basic format", () => {
		expect(formatIcalDate(new Date("2026-07-17T19:30:00Z"))).toBe("20260717T193000Z");
	});
});

describe("buildCalendar", () => {
	it("emits a valid VCALENDAR wrapper with CRLF endings", () => {
		const feed = buildCalendar([event()], { name: "NextQuest — Testers" });
		expect(feed.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
		expect(feed.endsWith("END:VCALENDAR\r\n")).toBe(true);
		expect(feed).toContain("X-WR-CALNAME:NextQuest — Testers");
		// No bare LF anywhere — every line break is CRLF.
		expect(feed.replace(/\r\n/g, "")).not.toContain("\n");
	});

	it("maps event fields onto the VEVENT", () => {
		const feed = buildCalendar([event()], { name: "NQ" });
		expect(feed).toContain("UID:11111111-2222-4333-8444-555555555555@nextquest");
		expect(feed).toContain("DTSTART:20260717T193000Z");
		expect(feed).toContain("DTEND:20260717T213000Z"); // +120 min
		expect(feed).toContain("DTSTAMP:20260710T080000Z");
		expect(feed).toContain("SUMMARY:Game Night 5");
		expect(feed).toContain("LOCATION:the couch");
		expect(feed).toContain("DESCRIPTION:bring snacks");
		expect(feed).toContain("STATUS:CONFIRMED");
	});

	it("defaults a missing duration and omits empty optionals", () => {
		const feed = buildCalendar(
			[event({ durationMinutes: null, location: null, description: null })],
			{ name: "NQ" }
		);
		const expectedEnd = new Date(
			new Date("2026-07-17T19:30:00Z").getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000
		);
		expect(feed).toContain(`DTEND:${formatIcalDate(expectedEnd)}`);
		expect(feed).not.toContain("LOCATION:");
		expect(feed).not.toContain("DESCRIPTION:");
	});

	it("marks cancelled events and escapes text fields", () => {
		const feed = buildCalendar(
			[event({ cancelled: true, title: "Boss night; bring dice, maybe" })],
			{ name: "NQ" }
		);
		expect(feed).toContain("STATUS:CANCELLED");
		expect(feed).toContain("SUMMARY:Boss night\\; bring dice\\, maybe");
	});

	it("folds long content lines at the RFC boundary with continuation spaces", () => {
		const feed = buildCalendar([event({ description: "x".repeat(300) })], { name: "NQ" });
		for (const line of feed.split("\r\n")) {
			expect(line.length).toBeLessThanOrEqual(74);
		}
		expect(feed).toContain("\r\n x"); // folded continuation
	});
});

describe("deriveCalendarToken", () => {
	it("is deterministic for a secret and distinct across secrets", async () => {
		const a1 = await deriveCalendarToken("secret-a");
		const a2 = await deriveCalendarToken("secret-a");
		const b = await deriveCalendarToken("secret-b");
		expect(a1).toBe(a2);
		expect(a1).toMatch(/^[0-9a-f]{32}$/);
		expect(a1).not.toBe(b);
	});
});
