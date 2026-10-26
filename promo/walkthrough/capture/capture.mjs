// Film the real app for the walkthrough: drive each flow in Playwright as a
// demo user, save a PNG per state plus the on-screen box of whatever was
// tapped, and write captures/manifest.json for the compositor.
//
// Prereqs (see ../README.md): Postgres + the Neon-HTTP shim, the promo seed,
// `npm run dev` on :3000, and the generated game art (`node capture/art.mjs`).
//
//   CHROMIUM=/path/to/chrome node promo/walkthrough/capture/capture.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { routeArt } from "./art.mjs";
import { pool, sessionCookie } from "./auth.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
process.chdir(root);
const OUT = path.resolve(here, "../captures");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TZ = process.env.PROMO_TZ ?? fs.readFileSync("/var/tmp/nq-tz.txt", "utf8").trim();
fs.mkdirSync(OUT, { recursive: true });

const IDS = {
	deepRock: "7a0e0002-0000-4000-8000-000000000003",
	ashen: "7a0e0001-0000-4000-8000-000000000017",
};
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };

const db = pool();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const manifest = { tz: TZ, capturedAt: new Date().toISOString(), shots: {}, discord: [] };
const artMisses = new Set();

async function context(user, device) {
	const ctx = await browser.newContext({ ...device, timezoneId: TZ, colorScheme: "dark", locale: "en-US" });
	if (user) await ctx.addCookies([await sessionCookie(db, user)]);
	const misses = await routeArt(ctx);
	ctx.on("close", () => misses.forEach((url) => artMisses.add(url)));
	return ctx;
}

async function settle(page) {
	await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
	// Hide the Next.js dev badge and scrollbars; wait for fonts and images.
	await page.addStyleTag({ content: "nextjs-portal{display:none!important} ::-webkit-scrollbar{display:none} *{caret-color:transparent}" });
	await page.evaluate(async () => {
		await document.fonts.ready;
		// Lazy images below the fold never start loading, so cap the wait.
		const pending = [...document.images].filter((img) => !img.complete);
		await Promise.race([
			Promise.all(pending.map((img) => new Promise((r) => { img.addEventListener("load", r); img.addEventListener("error", r); }))),
			new Promise((r) => setTimeout(r, 6000)),
		]);
	});
	await page.waitForTimeout(350);
}

async function box(locator) {
	const b = await locator.boundingBox();
	return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
}

/** Screenshot the viewport; `tap` is the element about to be (or just) pressed. */
async function shot(page, name, { tap = null, full = false, label = null } = {}) {
	const file = `${name}.png`;
	await page.screenshot({ path: path.join(OUT, file), fullPage: full });
	const vp = page.viewportSize();
	manifest.shots[name] = { file, w: vp.width, h: vp.height, full, tap: tap ? await box(tap) : null, label };
	console.log("  ", name);
}

async function scrollTo(page, locator, offset = 140) {
	const handle = await locator.elementHandle();
	await page.evaluate(([el, off]) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off), [handle, offset]);
	await page.waitForTimeout(250);
}

function discordState(sessionId, name) {
	// Links in the reminder show the group's public URL, not localhost.
	const env = { ...process.env, BETTER_AUTH_URL: process.env.PROMO_BASE_URL ?? "https://nextquest.example" };
	const json = execFileSync("npx", ["tsx", "promo/walkthrough/capture/discord-embeds.ts", sessionId], { encoding: "utf8", env });
	manifest.discord.push({ name, ...JSON.parse(json) });
	console.log("   discord:", name);
}

// ---------------------------------------------------------------- 02 post
console.log("post");
let sessionId;
{
	const ctx = await context("promo-brooke", PHONE);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/`);
	await settle(page);
	await shot(page, "post-00-home", { tap: page.getByRole("link", { name: "Post a session" }).first() });
	await page.goto(`${BASE}/sessions/new`);
	await settle(page);
	const game = page.locator("#session-game");
	await shot(page, "post-01-composer", { tap: game });
	await game.click();
	await game.pressSequentially("Starfall Salvage", { delay: 40 });
	await page.keyboard.press("Escape");
	await page.waitForTimeout(200);
	await shot(page, "post-02-game", { tap: game });
	const tonight = page.getByRole("button", { name: "Tonight 8pm" });
	await tonight.click();
	await page.waitForTimeout(400);
	await shot(page, "post-03-when", { tap: tonight });
	const open = page.getByRole("button", { name: /Open to the circle/ });
	await scrollTo(page, open, 260);
	await open.click();
	await shot(page, "post-04-open", { tap: open });
	await page.locator("details summary").click();
	await page.locator("#session-title").fill("Starfall Salvage — wreck night");
	await page.locator("#session-length").selectOption("180");
	await page.locator("#session-capacity").selectOption("4");
	await page.locator("#session-location").fill("Discord voice");
	await page.locator("#session-notes").fill("Bring spare fuel cells.");
	const post = page.getByRole("button", { name: "Post session" });
	await scrollTo(page, post, 520);
	await shot(page, "post-05-details", { tap: post });
	await post.click();
	await page.waitForURL(/\/s\/[0-9a-f-]{36}$/, { timeout: 60_000 });
	sessionId = page.url().split("/s/")[1];
	await settle(page);
	await shot(page, "post-06-posted");
	await ctx.close();
	manifest.sessionId = sessionId;
}
discordState(sessionId, "posted");

// ---------------------------------------------------------------- 03 discord: friends join
console.log("discord");
for (const [user, name] of [["promo-drew", "drew"], ["promo-jordan", "jordan"]]) {
	const ctx = await context(user, PHONE);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/s/${sessionId}`);
	await settle(page);
	const imIn = page.getByRole("button", { name: "I'm in" }).first();
	await imIn.click();
	await page.waitForTimeout(1200);
	await ctx.close();
	discordState(sessionId, `+${name}`);
}

// ---------------------------------------------------------------- 04 join: the circle
console.log("join");
{
	const ctx = await context(null, PHONE);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/invite/promo-walkthrough-invite`);
	await settle(page);
	await shot(page, "join-00-invite", { tap: page.getByRole("button", { name: "Continue with Discord" }) });
	await ctx.close();
}
{
	const ctx = await context("promo-frankie", PHONE);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/`);
	await settle(page);
	const card = page.getByRole("link", { name: "Starfall Salvage — wreck night" }).first();
	await shot(page, "join-01-guest-home", { tap: card });
	await page.goto(`${BASE}/s/${sessionId}`);
	await settle(page);
	const imIn = page.getByRole("button", { name: "I'm in" }).first();
	await shot(page, "join-02-session", { tap: imIn });
	await imIn.click();
	await page.waitForTimeout(1500);
	await settle(page);
	const cal = page.getByRole("link", { name: /Add to calendar/ }).first();
	await shot(page, "join-03-in", { tap: (await cal.count()) ? cal : null });
	await ctx.close();
}
discordState(sessionId, "+frankie");

// ---------------------------------------------------------------- 05 wrap up
console.log("wrap");
{
	const ctx = await context("promo-drew", PHONE);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/s/${IDS.deepRock}`);
	await settle(page);
	await shot(page, "wrap-00-ended");
	const form = page.locator("form").filter({ has: page.locator("#wrap-recap") });
	await scrollTo(page, form, 130);
	const jordan = form.locator("label").filter({ hasText: "Jordan" }).locator("input[type=checkbox]");
	await shot(page, "wrap-01-form", { tap: jordan });
	await jordan.check();
	await shot(page, "wrap-02-ticked", { tap: jordan });
	const five = page.getByRole("radio", { name: "5 stars" });
	await five.click();
	await shot(page, "wrap-03-stars", { tap: five });
	const recap = page.locator("#wrap-recap");
	await recap.click();
	await recap.pressSequentially("Cracked the magma core with our last charge. Breakers forever.", { delay: 15 });
	await shot(page, "wrap-04-recap", { tap: recap });
	const next = form.locator("input[name=scheduleNext]");
	await next.check();
	const save = page.getByRole("button", { name: "Save wrap-up" });
	await shot(page, "wrap-05-next", { tap: next });
	await save.click();
	await page.waitForTimeout(2500);
	await page.goto(`${BASE}/s/${IDS.deepRock}`);
	await settle(page);
	await shot(page, "wrap-06-played");
	await page.goto(`${BASE}/`);
	await settle(page);
	const recent = page.getByRole("heading", { name: "Recently played" });
	if (await recent.count()) await scrollTo(page, recent, 80);
	await shot(page, "wrap-07-recent");
	await ctx.close();
}

// ---------------------------------------------------------------- 06 everything around it (desktop)
console.log("more");
{
	const ctx = await context("promo-brooke", DESK);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/`);
	await settle(page);
	await shot(page, "more-00-home");
	await page.goto(`${BASE}/backlog`);
	await settle(page);
	await shot(page, "more-01-library");
	await page.goto(`${BASE}/backlog/${IDS.ashen}`);
	await settle(page);
	const keen = page.getByRole("button", { name: /I'd play this/ }).first();
	await shot(page, "more-02-game", { tap: keen });
	if (await keen.count()) {
		await keen.click();
		await page.waitForTimeout(1200);
		await shot(page, "more-03-keen", { tap: page.getByRole("button", { name: /You'd play this/ }).first() });
	}
	await page.goto(`${BASE}/sessions/plan`);
	await settle(page);
	await shot(page, "more-04-poll");
	await page.goto(`${BASE}/stats`);
	await settle(page);
	await shot(page, "more-05-stats");
	await ctx.close();
}

await browser.close();

await db.end();
manifest.missingArt = [...artMisses].sort();
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
if (artMisses.size) console.warn(`⚠ ${artMisses.size} game images were not in art-cache/ and render blank (run capture/art.mjs first)`);
console.log(`captures → ${path.relative(root, OUT)} (${Object.keys(manifest.shots).length} shots, ${manifest.discord.length} Discord states)`);
