import { defineConfig, devices } from "@playwright/test";

import { APP_PORT, APP_URL, DATABASE_URL, FAKE_DISCORD_PORT, SHIM_PORT } from "./e2e/env.mjs";

// E2E smoke suite (Phase 22): the real app on `next dev`, the real Neon
// driver through the local shim, a throwaway Postgres, and a fake Discord.
// `npm run e2e` needs only a local Postgres (see docs/local-dev.md); CI
// provides one as a service container. Sign-in is a minted Better Auth
// session cookie (e2e/helpers.ts) — no OAuth, and no test-only code in the app.
export default defineConfig({
	testDir: "e2e",
	// One database, one dev server: tests share state, so run them in order.
	workers: 1,
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	// `next dev` compiles each route on first hit.
	timeout: 90_000,
	expect: { timeout: 20_000 },
	reporter: process.env.CI ? [["github"], ["list"]] : "list",
	use: {
		baseURL: APP_URL,
		trace: "off",
		screenshot: "only-on-failure",
		timezoneId: "America/New_York",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command: "node scripts/neon-http-shim.mjs",
			env: { SHIM_PORT: String(SHIM_PORT), SHIM_TARGET: DATABASE_URL },
			port: SHIM_PORT,
			reuseExistingServer: false,
		},
		{
			command: "node e2e/fake-discord.mjs",
			port: FAKE_DISCORD_PORT,
			reuseExistingServer: false,
		},
		{
			command: `node e2e/prepare.mjs && npx next dev -p ${APP_PORT}`,
			env: { NEXT_DEV_WRANGLER_ENV: "e2e", NEXT_TELEMETRY_DISABLED: "1" },
			url: `${APP_URL}/sign-in`,
			timeout: 180_000,
			reuseExistingServer: false,
		},
	],
});
