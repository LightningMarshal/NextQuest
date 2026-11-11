import { expect, test } from "@playwright/test";

import { BOT_CHANNEL_ID } from "./env.mjs";
import { sessionCard, signInAs } from "./helpers";

// The product's one loop, end to end: a member posts a session, the Discord
// card appears, a guest hops in, the host wraps it up. Serial — each step
// builds on the last, sharing one session.
test.describe.configure({ mode: "serial" });

let sessionId = "";
// Letters only: a title ending in digits reads as a campaign session number.
const title = `E2E night ${Date.now().toString(36)}x`;

test("signed-out visitors are sent to sign in, and come back to where they were going", async ({ page }) => {
	await page.goto("/sessions");
	await expect(page).toHaveURL(/\/sign-in\?next=%2Fsessions/);
	await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("a member posts an open session that starts now", async ({ page, context }) => {
	await signInAs(context, "seed-brooke");
	await page.goto("/sessions/new");
	await page.getByLabel(/what are you playing/i).fill("Deep Rock Galactic");
	await page.getByRole("button", { name: "Now", exact: true }).click();
	await page.getByRole("button", { name: /Open to the circle/ }).click();
	await page.getByText("More details").click();
	await page.getByLabel("Title").fill(title);
	await page.getByRole("button", { name: "Post session" }).click();

	await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
	sessionId = page.url().split("/s/")[1];
	await expect(page.getByRole("heading", { name: title })).toBeVisible();
	// The host is automatically in.
	await expect(page.getByRole("button", { name: "I'm in" })).toHaveAttribute("aria-pressed", "true");
});

test("the bot's Discord card appears, with RSVP buttons", async () => {
	await expect
		.poll(async () => (await sessionCard(BOT_CHANNEL_ID, sessionId))?.embeds?.[0].title)
		.toContain(title);
	const card = (await sessionCard(BOT_CHANNEL_ID, sessionId))!;
	expect(card.components?.[0].components.map((button) => button.label)).toEqual(["I'm in", "Maybe", "Out", "Open"]);
	expect(card.components?.[0].components[0].custom_id).toBe(`nq:rsvp:${sessionId}:yes`);
});

test("a guest sees the open session and hops in; the Discord card is edited in place", async ({ page, context }) => {
	await signInAs(context, "seed-frankie");
	await page.goto("/");
	await page.getByRole("link", { name: title }).first().click();
	await expect(page).toHaveURL(new RegExp(`/s/${sessionId}$`));
	await page.getByRole("button", { name: "I'm in" }).click();
	await expect(page.getByRole("button", { name: "I'm in" })).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByText("Frankie Moss").first()).toBeVisible();

	await expect
		.poll(async () => JSON.stringify((await sessionCard(BOT_CHANNEL_ID, sessionId))?.embeds?.[0].fields))
		.toContain("Frankie Moss");
	// Edited, not re-posted.
	expect((await sessionCard(BOT_CHANNEL_ID, sessionId))!.edits).toBeGreaterThan(0);
});

test("a guest can't see members-only sessions or member pages", async ({ page, context }) => {
	await signInAs(context, "seed-frankie");
	// Seeded members-only session.
	const response = await page.goto("/s/5eed0002-0000-4000-8000-000000000001");
	expect(response?.status()).toBe(404);
	await page.goto("/backlog");
	await expect(page).toHaveURL(/\/$/);
	await page.goto("/sessions");
	await expect(page.getByText("Strahd — Session 12")).toHaveCount(0);
});

test("the host wraps it up in a few taps; the card closes and loses its buttons", async ({ page, context }) => {
	await signInAs(context, "seed-brooke");
	await page.goto(`/s/${sessionId}`);
	await expect(page.getByLabel("Frankie Moss")).toBeChecked();
	await page.getByRole("radio", { name: "4 stars" }).click();
	await page.getByLabel(/one line about it/i).fill("Rock and stone.");
	await page.getByRole("button", { name: "Save wrap-up" }).click();

	await expect(page.getByText("Rock and stone.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Save wrap-up" })).toHaveCount(0);

	await expect
		.poll(async () => (await sessionCard(BOT_CHANNEL_ID, sessionId))?.embeds?.[0].title)
		.toContain("✅");
	expect((await sessionCard(BOT_CHANNEL_ID, sessionId))!.components).toEqual([]);

	await page.goto("/sessions");
	await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
});
