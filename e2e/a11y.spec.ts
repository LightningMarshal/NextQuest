import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { pool, signInAs } from "./helpers";

// Accessibility pass (Phase 23): axe across the main pages, in both themes'
// default (dark) and at phone width for the ones people use at the table.
// WCAG 2.1 A + AA rules; any violation fails, with the offending nodes in
// the message so the fix is obvious.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoViolations(page: Page, label: string) {
	// Let client components (local times, charts) settle before scanning.
	await page.waitForLoadState("load");
	await page.waitForTimeout(400);
	const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
	const summary = results.violations.map((violation) => ({
		rule: violation.id,
		impact: violation.impact,
		help: violation.help,
		nodes: violation.nodes.slice(0, 5).map((node) => `${node.target.join(" ")} — ${node.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
	}));
	expect(summary, `${label}: axe violations`).toEqual([]);
}

const MEMBER_PAGES: [string, string][] = [
	["home", "/"],
	["sessions", "/sessions"],
	["an upcoming session", "/s/5eed0002-0000-4000-8000-000000000001"],
	["a played session", "/s/5eed0002-0000-4000-8000-000000000003"],
	["a session waiting for wrap-up", "/s/5eed0002-0000-4000-8000-000000000002"],
	["post a session", "/sessions/new"],
	["find a time", "/sessions/plan"],
	["library", "/backlog"],
	["a game", "/backlog/5eed0001-0000-4000-8000-000000000001"],
	["stats", "/stats"],
	["year in review", "/review"],
	["a member", "/members/seed-brooke"],
	["invites", "/invites"],
	["connect Discord", "/connect-discord"],
];

test.describe("members", () => {
	for (const [label, path] of MEMBER_PAGES) {
		test(`${label} (${path}) has no axe violations`, async ({ page, context }) => {
			await signInAs(context, "seed-casey");
			await page.goto(path);
			await expectNoViolations(page, label);
		});
	}
});

test("admin has no axe violations", async ({ page, context }) => {
	await signInAs(context, "seed-alex");
	await page.goto("/admin");
	await expectNoViolations(page, "admin");
});

test("a game's admin tools, opened, have no axe violations", async ({ page, context }) => {
	await signInAs(context, "seed-alex");
	await page.goto("/backlog/5eed0001-0000-4000-8000-000000000001");
	await page.getByText("Admin — merge a duplicate, or delete").click();
	await page.getByText("Manage — tags, metadata, artwork").click();
	await expectNoViolations(page, "game admin tools");
});

test("sign-in has no axe violations", async ({ page }) => {
	await page.goto("/sign-in");
	await expectNoViolations(page, "sign-in");
});

test.describe("on a phone", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	for (const [label, path] of [
		["home", "/"],
		["an upcoming session", "/s/5eed0002-0000-4000-8000-000000000005"],
		["library", "/backlog"],
	] as const) {
		test(`${label} (${path}) has no axe violations as a guest or member`, async ({ page, context }) => {
			await signInAs(context, label === "library" ? "seed-casey" : "seed-frankie");
			await page.goto(path);
			await expectNoViolations(page, `${label} @390`);
		});
	}

	test("the mobile navigation menu, opened, has no axe violations", async ({ page, context }) => {
		await signInAs(context, "seed-casey");
		await page.goto("/");
		await page.getByRole("button", { name: "Open navigation" }).click();
		await expect(page.getByRole("menuitem", { name: "Library" })).toBeVisible();
		await expectNoViolations(page, "mobile nav");
	});
});

test("light theme: home and a session have no axe violations", async ({ page, context }) => {
	await signInAs(context, "seed-casey");
	await page.addInitScript(() => localStorage.setItem("theme", "light"));
	for (const path of ["/", "/s/5eed0002-0000-4000-8000-000000000005", "/backlog", "/stats"]) {
		await page.goto(path);
		await expect(page.locator("html")).toHaveClass(/light/);
		await expectNoViolations(page, `light ${path}`);
	}
});

test.describe("the welcome tour", () => {
	// Drew hasn't seen it (prepare.mjs marks everyone as having seen it).
	test.beforeEach(async () => {
		await pool.query("update \"user\" set tutorial_seen_at = null where id = 'seed-drew'");
	});
	test.afterAll(async () => {
		await pool.query("update \"user\" set tutorial_seen_at = now() where id = 'seed-drew'");
	});

	test("opens for a first visit with no axe violations, and keeps Tab inside the dialog", async ({ page, context }) => {
		await signInAs(context, "seed-drew");
		await page.goto("/");
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await expectNoViolations(page, "welcome tour");

		// More Tab presses than the dialog has controls: focus must still be inside.
		for (let i = 0; i < 8; i++) {
			await page.keyboard.press("Tab");
			expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
		}
		await page.keyboard.press("Shift+Tab");
		expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
	});

	test("Escape dismisses it for good", async ({ page, context }) => {
		await signInAs(context, "seed-drew");
		await page.goto("/");
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect
			.poll(async () => (await pool.query("select tutorial_seen_at from \"user\" where id = 'seed-drew'")).rows[0].tutorial_seen_at)
			.not.toBeNull();
		await page.reload();
		await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});
});
