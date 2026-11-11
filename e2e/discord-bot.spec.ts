import { expect, test } from "@playwright/test";

import { BOT_CHANNEL_ID, DISCORD_IDS } from "./env.mjs";
import { followUpContent, pool, pressButton, sessionCard, signInAs } from "./helpers";

// The Discord bot's buttons, driven the way Discord drives them: signed
// POSTs to /api/discord/interactions. Uses the seeded sessions.
const OPEN_SESSION = "5eed0002-0000-4000-8000-000000000005"; // "Rust — fresh wipe", open, 6 seats
const MEMBERS_SESSION = "5eed0002-0000-4000-8000-000000000001"; // "Strahd — Session 12"

async function reply(response: Awaited<ReturnType<typeof pressButton>>): Promise<string> {
	expect(response.status()).toBe(200);
	const body = (await response.json()) as { type: number; data: { content: string; flags: number } };
	expect(body.type).toBe(4);
	expect(body.data.flags).toBe(64); // only the presser sees it
	return body.data.content;
}

test("a request that isn't signed by Discord is refused", async ({ request }) => {
	const response = await pressButton(request, DISCORD_IDS["seed-casey"], `nq:rsvp:${OPEN_SESSION}:yes`, { tamper: true });
	expect(response.status()).toBe(401);
	const unsigned = await request.post("/api/discord/interactions", { data: { type: 1 } });
	expect(unsigned.status()).toBe(401);
});

test("pressing I'm in RSVPs the linked member, on the site and on the card", async ({ request, page, context }) => {
	const text = await reply(await pressButton(request, DISCORD_IDS["seed-casey"], `nq:rsvp:${OPEN_SESSION}:yes`));
	expect(text).toContain("You're in for **Rust — fresh wipe**");

	const { rows } = await pool.query("select rsvp from event_attendance where event_id = $1 and user_id = 'seed-casey'", [OPEN_SESSION]);
	expect(rows[0]?.rsvp).toBe("yes");

	// The card is posted on first sync (the seed doesn't announce) and lists Casey.
	await expect
		.poll(async () => JSON.stringify((await sessionCard(BOT_CHANNEL_ID, OPEN_SESSION))?.embeds?.[0].fields))
		.toContain("Casey Nwosu");

	await signInAs(context, "seed-casey");
	await page.goto(`/s/${OPEN_SESSION}`);
	await expect(page.getByRole("button", { name: "I'm in" })).toHaveAttribute("aria-pressed", "true");
});

test("a guest's button press can't touch a members-only session", async ({ request }) => {
	const text = await reply(await pressButton(request, DISCORD_IDS["seed-frankie"], `nq:rsvp:${MEMBERS_SESSION}:yes`));
	expect(text).toContain("isn't available to you");
	const { rows } = await pool.query("select 1 from event_attendance where event_id = $1 and user_id = 'seed-frankie'", [MEMBERS_SESSION]);
	expect(rows).toHaveLength(0);
});

test("someone the app doesn't know is pointed at Connect Discord", async ({ request, page, context }) => {
	const text = await reply(await pressButton(request, "812345678901234567", `nq:rsvp:${OPEN_SESSION}:yes`));
	expect(text).toContain("/connect-discord");

	// The page they land on: already-linked people are told so…
	await signInAs(context, "seed-brooke");
	await page.goto("/connect-discord");
	await expect(page.getByText("Your Discord account is connected.")).toBeVisible();
	// …and everyone else gets the button.
	await signInAs(context, "seed-drew");
	await page.goto("/connect-discord");
	await expect(page.getByRole("button", { name: "Connect Discord" })).toBeVisible();
});

test("a full session refuses one more", async ({ request }) => {
	await pool.query("update events set capacity = 2 where id = $1", [OPEN_SESSION]);
	try {
		const { rows } = await pool.query("select count(*)::int as n from event_attendance where event_id = $1 and rsvp = 'yes'", [OPEN_SESSION]);
		expect(rows[0].n).toBeGreaterThanOrEqual(2);
		const text = await reply(await pressButton(request, DISCORD_IDS["seed-frankie"], `nq:rsvp:${OPEN_SESSION}:yes`));
		expect(text).toContain("full");
	} finally {
		await pool.query("update events set capacity = 6 where id = $1", [OPEN_SESSION]);
	}
});

test("a slow database gets a deferred reply, then the real answer as a follow-up", async ({ request }) => {
	// Hold a lock the RSVP write needs, longer than Discord's patience — the
	// same shape as a Neon database waking from idle. No test hook in the app.
	const token = `e2e-slow-token-${Date.now()}`;
	const client = await pool.connect();
	try {
		await client.query("begin");
		await client.query("lock table event_attendance in access exclusive mode");
		const pressed = pressButton(request, DISCORD_IDS["seed-casey"], `nq:rsvp:${MEMBERS_SESSION}:maybe`, { token });
		const response = await pressed;
		expect(response.status()).toBe(200);
		// "Thinking…", privately — sent inside Discord's 3-second window.
		expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } });
		expect(await followUpContent(token)).toBeUndefined();
	} finally {
		await client.query("commit");
		client.release();
	}
	await expect.poll(() => followUpContent(token)).toContain("Marked as maybe for **Strahd — Session 12**");
	const { rows } = await pool.query("select rsvp from event_attendance where event_id = $1 and user_id = 'seed-casey'", [MEMBERS_SESSION]);
	expect(rows[0]?.rsvp).toBe("maybe");
});
