import { describe, expect, it } from "vitest";

import {
	autocompleteReply,
	commandReplyText,
	COMMANDS,
	focusedText,
	parsePostCommand,
	sessionsListText,
	START_CHOICES,
	type ListedSession,
} from "./discord-commands";

const opts = (values: Record<string, unknown>) => ({
	name: "post",
	options: Object.entries(values).map(([name, value]) => ({ name, value })),
});

describe("command definitions", () => {
	it("stay inside Discord's rules", () => {
		for (const command of COMMANDS) {
			expect(command.name).toMatch(/^[a-z0-9_-]{1,32}$/);
			expect(command.description.length).toBeLessThanOrEqual(100);
			const options = "options" in command ? command.options : [];
			// Required options must come before optional ones.
			const firstOptional = options.findIndex((option) => !("required" in option && option.required));
			const lastRequired = options.map((option) => "required" in option && option.required).lastIndexOf(true);
			if (firstOptional !== -1) expect(lastRequired).toBeLessThan(firstOptional);
			for (const option of options) {
				expect(option.name).toMatch(/^[a-z0-9_-]{1,32}$/);
				expect(option.description.length).toBeLessThanOrEqual(100);
			}
		}
	});
});

describe("parsePostCommand", () => {
	it("reads a minimal post as members-only", () => {
		expect(parsePostCommand(opts({ game: "  Rust ", starts: 60 }))).toEqual({
			gameTitle: "Rust",
			startsInMinutes: 60,
			visibility: "members",
			capacity: undefined,
			notes: undefined,
		});
	});

	it("reads every option", () => {
		expect(parsePostCommand(opts({ game: "Rust", starts: 0, open: true, seats: 4, note: " bring a mic " }))).toEqual({
			gameTitle: "Rust",
			startsInMinutes: 0,
			visibility: "open",
			capacity: 4,
			notes: "bring a mic",
		});
	});

	it("re-checks what Discord's client is supposed to enforce", () => {
		expect(parsePostCommand(opts({ starts: 60 }))).toMatch(/what you're playing/);
		expect(parsePostCommand(opts({ game: "   ", starts: 60 }))).toMatch(/what you're playing/);
		expect(parsePostCommand(opts({ game: "x".repeat(201), starts: 60 }))).toMatch(/too long/);
		expect(parsePostCommand(opts({ game: "Rust", starts: 45 }))).toMatch(/start times/);
		expect(parsePostCommand(opts({ game: "Rust", starts: "60" }))).toMatch(/start times/);
		expect(parsePostCommand(opts({ game: "Rust", starts: 60, seats: 1 }))).toMatch(/Seats/);
		expect(parsePostCommand(opts({ game: "Rust", starts: 60, seats: 2.5 }))).toMatch(/Seats/);
		expect(parsePostCommand(opts({ game: "Rust", starts: 60, note: "x".repeat(501) }))).toMatch(/note/);
		expect(parsePostCommand(undefined)).toMatch(/what you're playing/);
		expect(parsePostCommand({ options: "nope" })).toMatch(/what you're playing/);
	});

	it("only an explicit true makes a session open", () => {
		expect(parsePostCommand(opts({ game: "Rust", starts: 0, open: "true" }))).toMatchObject({ visibility: "members" });
		expect(parsePostCommand(opts({ game: "Rust", starts: 0, open: false }))).toMatchObject({ visibility: "members" });
	});

	it("offers offsets, never clock times", () => {
		expect(START_CHOICES.map((choice) => choice.value)).toEqual([0, 30, 60, 120, 180]);
	});
});

describe("autocomplete", () => {
	it("finds the option being typed", () => {
		expect(focusedText({ options: [{ name: "game", value: "ru", focused: true }, { name: "starts", value: 0 }] })).toBe("ru");
		expect(focusedText({ options: [{ name: "game", value: "ru" }] })).toBeNull();
		expect(focusedText(undefined)).toBeNull();
	});

	it("caps choices at 25 and names at 100 characters", () => {
		const reply = autocompleteReply(Array.from({ length: 40 }, (_, i) => `${"g".repeat(120)}${i}`));
		expect(reply.type).toBe(8);
		expect(reply.data.choices).toHaveLength(25);
		expect(reply.data.choices[0].name).toHaveLength(100);
	});
});

describe("sessionsListText", () => {
	const session = (n: number, overrides: Partial<ListedSession> = {}): ListedSession => ({
		id: `0000000${n}-0000-4000-8000-000000000000`,
		title: `Night ${n}`,
		scheduledAt: new Date("2026-11-12T01:00:00Z"),
		visibility: "open",
		capacity: null,
		going: 2,
		...overrides,
	});

	it("lists sessions with Discord-rendered times and unfurl-proof links", () => {
		const text = sessionsListText([session(1, { capacity: 6 }), session(2, { visibility: "members" })], "https://nq.example", true);
		expect(text).toContain("• **Night 1** — <t:1794445200:f> (<t:1794445200:R>) · 2/6 in · open");
		expect(text).toContain("<https://nq.example/s/00000001-0000-4000-8000-000000000000>");
		expect(text).toContain("· 2 in · members");
	});

	it("escapes member-typed titles", () => {
		expect(sessionsListText([session(1, { title: "**@everyone** [x](http://evil)" })], "https://x", true)).toContain(
			"\\*\\*@everyone\\*\\* \\[x\\]\\(http://evil\\)"
		);
	});

	it("says something useful when there's nothing on", () => {
		expect(sessionsListText([], "https://x", true)).toContain("/post");
		expect(sessionsListText([], "https://x", false)).not.toContain("/post");
	});

	it("never exceeds Discord's message limit, and says how many it dropped", () => {
		const many = Array.from({ length: 60 }, (_, i) => session(i % 10, { title: "A fairly long session title to pad things out" }));
		const text = sessionsListText(many, "https://nq.example", true);
		expect(text.length).toBeLessThanOrEqual(2000);
		expect(text).toMatch(/…and \d+ more: <https:\/\/nq\.example\/sessions>/);
	});
});

describe("commandReplyText", () => {
	it("words each outcome", () => {
		expect(commandReplyText({ kind: "unlinked" }, "https://x")).toContain("<https://x/connect-discord>");
		expect(commandReplyText({ kind: "not_approved" }, "https://x")).toContain("<https://x/apply>");
		expect(commandReplyText({ kind: "members_only" }, "https://x")).toContain("group members");
		expect(commandReplyText({ kind: "invalid", message: "Nope." }, "https://x")).toBe("Nope.");
		const posted = commandReplyText(
			{ kind: "posted", id: "abc", title: "Rust_night", startsAt: new Date("2026-11-12T01:00:00Z"), visibility: "open" },
			"https://x"
		);
		expect(posted).toContain("Posted **Rust\\_night**");
		expect(posted).toContain("open to the circle");
		expect(posted).toContain("<https://x/s/abc/edit>");
	});
});
