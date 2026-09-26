import { describe, expect, it } from "vitest";

import { buildSessionEmbed, buildSessionMessage, escapeMarkdown, type AnnouncedSession } from "./discord-embed";

const base: AnnouncedSession = {
	id: "11111111-1111-4111-8111-111111111111",
	title: "Rust",
	status: "scheduled",
	visibility: "open",
	scheduledAt: new Date("2026-10-06T03:00:00Z"),
	durationMinutes: 180,
	gameTitle: "Rust",
	art: "https://cdn.cloudflare.steamstatic.com/steam/apps/252490/header.jpg",
	hostName: "Brooke",
	location: "Discord voice",
	joinUrl: "https://discord.gg/abc",
	notes: "Fresh wipe, hop in",
	capacity: 4,
	going: ["Brooke", "Casey"],
	maybe: ["Drew"],
	came: [],
	howItWent: null,
	recap: null,
};

describe("buildSessionEmbed", () => {
	it("announces an open session with everything needed to decide", () => {
		const embed = buildSessionEmbed(base, "https://nq.example.com/");
		expect(embed.url).toBe("https://nq.example.com/s/11111111-1111-4111-8111-111111111111");
		expect(embed.title).toBe("🎮 Rust");
		const byName = Object.fromEntries(embed.fields.map((f) => [f.name, f.value]));
		expect(byName.When).toBe("<t:1791255600:F> · <t:1791255600:R> · 3h");
		expect(byName["In (2/4)"]).toBe("Brooke, Casey");
		expect(byName["Maybe (1)"]).toBe("Drew");
		expect(byName.Where).toBe("Discord voice · [Join link](https://discord.gg/abc)");
		expect(embed.footer?.text).toMatch(/Open session/);
		expect(embed.thumbnail?.url).toBe(base.art);
	});
	it("marks full sessions and members-only sessions", () => {
		const full = buildSessionEmbed({ ...base, going: ["A", "B", "C", "D"] }, "https://x");
		expect(full.fields.some((f) => f.name === "In (4/4 · full)")).toBe(true);
		const members = buildSessionEmbed({ ...base, visibility: "members" }, "https://x");
		expect(members.footer?.text).toMatch(/Members session/);
		expect(members.color).not.toBe(full.color);
	});
	it("renders cancelled and completed states in place", () => {
		expect(buildSessionEmbed({ ...base, status: "cancelled" }, "https://x").title).toBe(
			"❌ Cancelled — Rust"
		);
		const done = buildSessionEmbed(
			{ ...base, status: "completed", came: ["Brooke"], howItWent: 4, recap: "GG" },
			"https://x"
		);
		expect(done.title).toBe("✅ Rust");
		expect(done.description).toBe("GG");
		expect(done.fields.find((f) => f.name === "How it went")?.value).toBe("★★★★☆");
	});
	it("drops unsafe join links and non-https art", () => {
		const embed = buildSessionEmbed(
			{ ...base, joinUrl: "javascript:alert(1)", art: "http://insecure/x.png", location: null },
			"https://x"
		);
		expect(embed.fields.find((f) => f.name === "Where")).toBeUndefined();
		expect(embed.thumbnail).toBeUndefined();
	});
	it("escapes member-typed markdown so it can't forge links", () => {
		expect(escapeMarkdown("[click](https://evil)")).toBe("\\[click\\]\\(https://evil\\)");
		const embed = buildSessionEmbed({ ...base, going: ["**Bold**"] }, "https://x");
		expect(embed.fields.find((f) => f.name.startsWith("In"))?.value).toBe("\\*\\*Bold\\*\\*");
	});
	it("never allows mentions", () => {
		const message = buildSessionMessage({ ...base, title: "@everyone party" }, "https://x", "@here hi");
		expect(message.allowed_mentions).toEqual({ parse: [] });
	});
});
