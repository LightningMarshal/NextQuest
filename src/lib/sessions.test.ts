import { describe, expect, it } from "vitest";

import {
	bumpTrailingNumber,
	canManageSession,
	canRsvp,
	canSeeSession,
	canWrapUp,
	defaultSessionTitle,
	formatDuration,
	isAutoCloseDue,
	safeJoinUrl,
	sessionEndsAt,
	sessionPhase,
	summarizeRoster,
	trailingNumber,
	type RosterEntry,
} from "./sessions";

const start = new Date("2026-10-06T03:00:00Z"); // Mon 8pm PT
const at = (iso: string) => new Date(iso);
const scheduled = (durationMinutes: number | null = 120) => ({
	status: "scheduled" as const,
	scheduledAt: start,
	durationMinutes,
});

describe("sessionPhase", () => {
	it("walks upcoming → live → ended", () => {
		expect(sessionPhase(scheduled(), at("2026-10-06T02:59:00Z"))).toBe("upcoming");
		expect(sessionPhase(scheduled(), at("2026-10-06T03:00:00Z"))).toBe("live");
		expect(sessionPhase(scheduled(), at("2026-10-06T04:59:00Z"))).toBe("live");
		expect(sessionPhase(scheduled(), at("2026-10-06T05:00:00Z"))).toBe("ended");
	});
	it("uses a default length when none was given", () => {
		expect(sessionEndsAt(scheduled(null)).toISOString()).toBe("2026-10-06T06:00:00.000Z");
		expect(sessionPhase(scheduled(null), at("2026-10-06T05:30:00Z"))).toBe("live");
	});
	it("reports closed statuses regardless of time", () => {
		expect(sessionPhase({ ...scheduled(), status: "cancelled" }, at("2026-01-01T00:00:00Z"))).toBe(
			"cancelled"
		);
		expect(sessionPhase({ ...scheduled(), status: "completed" }, at("2030-01-01T00:00:00Z"))).toBe(
			"completed"
		);
	});
	it("gates RSVPs and wrap-ups by phase", () => {
		expect(canRsvp("upcoming") && canRsvp("live")).toBe(true);
		expect(canRsvp("ended") || canRsvp("completed") || canRsvp("cancelled")).toBe(false);
		expect(canWrapUp("live") && canWrapUp("ended")).toBe(true);
		expect(canWrapUp("upcoming") || canWrapUp("completed")).toBe(false);
	});
});

describe("isAutoCloseDue", () => {
	it("fires 48h after the end, only for scheduled sessions", () => {
		// ends 05:00Z on the 6th → due from 05:00Z on the 8th
		expect(isAutoCloseDue(scheduled(), at("2026-10-08T04:59:00Z"))).toBe(false);
		expect(isAutoCloseDue(scheduled(), at("2026-10-08T05:00:00Z"))).toBe(true);
		expect(isAutoCloseDue({ ...scheduled(), status: "completed" }, at("2027-01-01T00:00:00Z"))).toBe(
			false
		);
	});
});

describe("summarizeRoster", () => {
	const roster: RosterEntry[] = [
		{ userId: "a", name: "A", rsvp: "yes", attended: true },
		{ userId: "b", name: "B", rsvp: "yes", attended: false },
		{ userId: "c", name: "C", rsvp: "maybe", attended: null },
		{ userId: "d", name: "D", rsvp: "no", attended: null },
		{ userId: "e", name: "E", rsvp: null, attended: true },
	];
	it("buckets by RSVP and attendance", () => {
		const summary = summarizeRoster(roster, null);
		expect(summary.going.map((e) => e.userId)).toEqual(["a", "b"]);
		expect(summary.maybe.map((e) => e.userId)).toEqual(["c"]);
		expect(summary.out.map((e) => e.userId)).toEqual(["d"]);
		expect(summary.came.map((e) => e.userId)).toEqual(["a", "e"]);
		expect(summary.spotsLeft).toBeNull();
		expect(summary.full).toBe(false);
	});
	it("counts seats against the cap", () => {
		expect(summarizeRoster(roster, 4).spotsLeft).toBe(2);
		expect(summarizeRoster(roster, 2).full).toBe(true);
		expect(summarizeRoster(roster, 1).spotsLeft).toBe(0);
	});
});

describe("permissions", () => {
	it("host or admin manages", () => {
		expect(canManageSession({ createdBy: "u1" }, { id: "u1", role: "member" })).toBe(true);
		expect(canManageSession({ createdBy: "u1" }, { id: "u2", role: "member" })).toBe(false);
		expect(canManageSession({ createdBy: "u1" }, { id: "u2", role: "admin" })).toBe(true);
		expect(canManageSession({ createdBy: null }, { id: "u2", role: "member" })).toBe(false);
	});
	it("guests see only open sessions", () => {
		expect(canSeeSession("open", { role: "guest" })).toBe(true);
		expect(canSeeSession("members", { role: "guest" })).toBe(false);
		expect(canSeeSession("members", { role: "member" })).toBe(true);
	});
});

describe("titles and formatting", () => {
	it("defaults titles to the game", () => {
		expect(defaultSessionTitle("Rust")).toBe("Rust");
		expect(defaultSessionTitle(null)).toBe("Game night");
		expect(defaultSessionTitle("  ")).toBe("Game night");
	});
	it("handles trailing session numbers", () => {
		expect(trailingNumber("Strahd — Session 12")).toBe(12);
		expect(trailingNumber("Rust")).toBeUndefined();
		expect(bumpTrailingNumber("Strahd — Session 12")).toBe("Strahd — Session 13");
		expect(bumpTrailingNumber("Rust")).toBe("Rust");
	});
	it("formats durations", () => {
		expect(formatDuration(180)).toBe("3h");
		expect(formatDuration(90)).toBe("1h 30m");
		expect(formatDuration(45)).toBe("45m");
		expect(formatDuration(null)).toBeNull();
	});
	it("only renders http(s) join links", () => {
		expect(safeJoinUrl("https://discord.gg/abc")).toBe("https://discord.gg/abc");
		expect(safeJoinUrl("javascript:alert(1)")).toBeNull();
		expect(safeJoinUrl("steam://joinlobby/1/2")).toBeNull();
		expect(safeJoinUrl("not a url")).toBeNull();
	});
});
