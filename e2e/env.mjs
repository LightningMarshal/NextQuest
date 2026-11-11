// One place for the E2E stack's addresses. Everything is local and fake:
// a throwaway Postgres database, the Neon-HTTP shim in front of it, a fake
// Discord API, and `next dev` reading .dev.vars.e2e (written by prepare.mjs).
export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/nextquest_e2e";
export const SHIM_PORT = 4446;
export const FAKE_DISCORD_PORT = 4447;
export const APP_PORT = 3100;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const FAKE_DISCORD_URL = `http://127.0.0.1:${FAKE_DISCORD_PORT}`;
export const AUTH_SECRET = "e2e-only-secret-not-used-anywhere-real-0000";
export const CRON_SECRET = "e2e-cron-secret";
/** The channel the bot "posts" into (a row in discord_bot_channels). */
export const BOT_CHANNEL_ID = "900000000000000001";
/** Seeded demo people → the fake Discord ids prepare.mjs links to them. */
export const DISCORD_IDS = {
	"seed-brooke": "800000000000000001",
	"seed-casey": "800000000000000002",
	"seed-frankie": "800000000000000003",
};
/** Relative to the repo root, where every E2E command runs. */
export const STATE_DIR = "e2e/.state/";
