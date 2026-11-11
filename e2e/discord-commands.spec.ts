import { expect, test } from "@playwright/test";

import { BOT_CHANNEL_ID, DISCORD_IDS, FAKE_DISCORD_URL } from "./env.mjs";
import { pool, runCommand, sessionCard, signInAs, typeInto } from "./helpers";

// The bot's slash commands, delivered the way Discord delivers them.
// Seeded: "Rust — fresh wipe" is open; "Strahd — Session 12" is members-only.

async function reply(response: Awaited<ReturnType<typeof runCommand>>): Promise<string> {
	expect(response.status()).toBe(200);
	const body = (await response.json()) as { type: number; data: { content: string; flags: number; allowed_mentions: unknown } };
	expect(body.type).toBe(4);
	expect(body.data.flags).toBe(64); // only the person who ran it sees it
	expect(body.data.allowed_mentions).toEqual({ parse: [] });
	return body.data.content;
}

test.describe("/sessions", () => {
	test("a member sees every upcoming session", async ({ request }) => {
		const text = await reply(await runCommand(request, DISCORD_IDS["seed-brooke"], "sessions"));
		expect(text).toContain("Rust — fresh wipe");
		expect(text).toContain("Strahd — Session 12");
		expect(text).toMatch(/<http:\/\/localhost:3100\/s\/[0-9a-f-]{36}>/);
	});

	test("a guest sees open sessions only", async ({ request }) => {
		const text = await reply(await runCommand(request, DISCORD_IDS["seed-frankie"], "sessions"));
		expect(text).toContain("Rust — fresh wipe");
		expect(text).not.toContain("Strahd");
	});

	test("someone the app doesn't know is pointed at Connect Discord, and learns nothing", async ({ request }) => {
		const text = await reply(await runCommand(request, "812345678901234567", "sessions"));
		expect(text).toContain("/connect-discord");
		expect(text).not.toContain("Rust");
	});
});

test.describe("/post", () => {
	test("a member posts a session: it exists, they're in, and the card goes out", async ({ request, page, context }) => {
		const before = Date.now();
		const text = await reply(
			await runCommand(request, DISCORD_IDS["seed-casey"], "post", { game: "outer wilds", starts: 60, open: true, seats: 4, note: "Bring a mic" })
		);
		// Matched to the library game by name, whatever the capitalisation.
		expect(text).toContain("Posted **Outer Wilds**");
		expect(text).toContain("open to the circle");
		const id = text.match(/\/s\/([0-9a-f-]{36})\/edit/)?.[1];
		expect(id).toBeTruthy();

		const { rows } = await pool.query(
			"select e.title, e.visibility, e.capacity, e.notes, e.created_by, e.scheduled_at, g.title as game, (select rsvp from event_attendance where event_id = e.id and user_id = 'seed-casey') as host_rsvp from events e left join games g on g.id = e.game_id where e.id = $1",
			[id]
		);
		expect(rows[0]).toMatchObject({ title: "Outer Wilds", visibility: "open", capacity: 4, notes: "Bring a mic", created_by: "seed-casey", game: "Outer Wilds", host_rsvp: "yes" });
		const startsIn = new Date(rows[0].scheduled_at).getTime() - before;
		expect(startsIn).toBeGreaterThan(58 * 60_000);
		expect(startsIn).toBeLessThanOrEqual(60 * 60_000 + 5_000);

		// Announced like any other session — with buttons, since this is the bot's channel.
		await expect.poll(async () => (await sessionCard(BOT_CHANNEL_ID, id!))?.embeds?.[0].title).toContain("Outer Wilds");
		expect((await sessionCard(BOT_CHANNEL_ID, id!))!.components?.[0].components).toHaveLength(4);

		// And it's a normal session on the site, editable by its host.
		await signInAs(context, "seed-casey");
		await page.goto(`/s/${id}`);
		await expect(page.getByRole("heading", { name: "Outer Wilds" })).toBeVisible();
		await expect(page.getByRole("link", { name: /edit/i })).toBeVisible();
	});

	test("a game that isn't in the library is added as a suggestion", async ({ request }) => {
		const text = await reply(await runCommand(request, DISCORD_IDS["seed-brooke"], "post", { game: "Lethal Company", starts: 0 }));
		expect(text).toContain("Posted **Lethal Company**");
		expect(text).toContain("members only");
		const { rows } = await pool.query("select status, proposed_by from games where title = 'Lethal Company'");
		expect(rows).toEqual([{ status: "proposed", proposed_by: "seed-brooke" }]);
	});

	test("a guest can't post", async ({ request }) => {
		const before = await pool.query("select count(*)::int as n from events");
		const text = await reply(await runCommand(request, DISCORD_IDS["seed-frankie"], "post", { game: "Rust", starts: 0 }));
		expect(text).toContain("group members");
		const after = await pool.query("select count(*)::int as n from events");
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});

	test("options are re-checked on the server", async ({ request }) => {
		const before = await pool.query("select count(*)::int as n from events");
		expect(await reply(await runCommand(request, DISCORD_IDS["seed-brooke"], "post", { game: "Rust", starts: 100000 }))).toContain("start times");
		expect(await reply(await runCommand(request, DISCORD_IDS["seed-brooke"], "post", { game: "Rust", starts: 0, seats: 500 }))).toContain("Seats");
		const after = await pool.query("select count(*)::int as n from events");
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});
});

test.describe("game suggestions while typing", () => {
	async function choices(response: Awaited<ReturnType<typeof typeInto>>): Promise<string[]> {
		expect(response.status()).toBe(200);
		const body = (await response.json()) as { type: number; data: { choices: { name: string; value: string }[] } };
		expect(body.type).toBe(8);
		return body.data.choices.map((choice) => choice.value);
	}

	test("members get matching library titles", async ({ request }) => {
		expect(await choices(await typeInto(request, DISCORD_IDS["seed-brooke"], "post", "game", "wild"))).toEqual(["Outer Wilds"]);
		// Nothing typed yet: the library, what's being played first.
		const all = await choices(await typeInto(request, DISCORD_IDS["seed-brooke"], "post", "game", ""));
		expect(all.length).toBeGreaterThan(5);
		expect(all[0]).toBe("Baldur's Gate 3");
		// LIKE wildcards in what's typed are literal.
		expect(await choices(await typeInto(request, DISCORD_IDS["seed-brooke"], "post", "game", "%"))).toEqual([]);
	});

	test("guests and strangers get nothing — the library is members-only", async ({ request }) => {
		expect(await choices(await typeInto(request, DISCORD_IDS["seed-frankie"], "post", "game", "wild"))).toEqual([]);
		expect(await choices(await typeInto(request, "812345678901234567", "post", "game", "wild"))).toEqual([]);
	});
});

test("an admin switches the commands on from the Admin page", async ({ page, context }) => {
	await signInAs(context, "seed-alex");
	await page.goto("/admin");
	await page.getByRole("button", { name: "Set up slash commands" }).click();
	await expect(page.getByRole("status")).toContainText("Discord now has /sessions and /post");

	const registered = (await (await fetch(`${FAKE_DISCORD_URL}/__commands`)).json()) as { name: string; options?: { name: string; autocomplete?: boolean }[] }[];
	expect(registered.map((command) => command.name)).toEqual(["sessions", "post"]);
	expect(registered[1].options?.find((option) => option.name === "game")?.autocomplete).toBe(true);
});
