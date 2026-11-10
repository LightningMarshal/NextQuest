import { expect, test } from "@playwright/test";

import { pool, signInAs } from "./helpers";

// Admin data hygiene (Phase 23): hard-delete a typo proposal, merge a
// duplicate into the real entry. Both are permanent, so the suite proves
// what survives.
const HADES = "5eed0001-0000-4000-8000-000000000003"; // completed, has history
const VINTAGE_STORY = "5eed0001-0000-4000-8000-000000000010"; // proposed, never played
const CELESTE = "5eed0001-0000-4000-8000-000000000004"; // completed
const DUPE = "e2e00001-0000-4000-8000-000000000001";
const DUPE_SESSION = "e2e00002-0000-4000-8000-000000000001";

// A failed test restarts the worker and re-runs beforeAll, so setup must be
// repeatable.
test.beforeAll(async () => {
	await pool.query("delete from events where id = $1", [DUPE_SESSION]);
	await pool.query("delete from games where id = $1", [DUPE]);
	// "Hades (PC)": someone proposed the game the group already finished,
	// then people piled on — a session, a comment, two "I'd play this" marks
	// (one from Casey, who is also marked on the real Hades below).
	await pool.query("insert into games (id, title, status, proposed_by) values ($1, 'Hades (PC)', 'proposed', 'seed-drew')", [DUPE]);
	await pool.query("insert into game_metadata (game_id, source) values ($1, 'manual')", [DUPE]);
	await pool.query(
		"insert into events (id, title, game_id, scheduled_at, status, visibility, created_by) values ($1, 'Hades again', $2, now() + interval '5 days', 'scheduled', 'members', 'seed-drew')",
		[DUPE_SESSION, DUPE]
	);
	await pool.query("insert into game_comments (game_id, user_id, body) values ($1, 'seed-drew', 'Isn''t this already in the library?')", [DUPE]);
	await pool.query("insert into game_interest (game_id, user_id) values ($1, 'seed-drew'), ($1, 'seed-casey')", [DUPE]);
	await pool.query("insert into game_interest (game_id, user_id) values ($1, 'seed-casey') on conflict do nothing", [HADES]);
});

test("members don't see the admin tools", async ({ page, context }) => {
	await signInAs(context, "seed-brooke");
	await page.goto(`/backlog/${VINTAGE_STORY}`);
	await expect(page.getByRole("heading", { name: "Vintage Story" })).toBeVisible();
	await expect(page.getByText("Admin — merge a duplicate, or delete")).toHaveCount(0);
});

test("a played game can't be deleted, only merged", async ({ page, context }) => {
	await signInAs(context, "seed-alex");
	await page.goto(`/backlog/${CELESTE}`);
	await page.getByText("Admin — merge a duplicate, or delete").click();
	await expect(page.getByText(/has been played — its history feeds the stats/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Delete game" })).toHaveCount(0);
});

test("an admin merges a duplicate into the real game", async ({ page, context }) => {
	await signInAs(context, "seed-alex");
	await page.goto(`/backlog/${DUPE}`);
	await page.getByText("Admin — merge a duplicate, or delete").click();
	await page.getByLabel("Keep this game").selectOption(HADES);
	await page.getByLabel(/Merge “Hades \(PC\)” into it/).check();
	await page.getByRole("button", { name: "Merge", exact: true }).click();

	// Lands on the surviving game, which now carries the duplicate's thread.
	await expect(page).toHaveURL(new RegExp(`/backlog/${HADES}$`));
	await expect(page.getByText("Isn't this already in the library?")).toBeVisible();

	const gone = await pool.query("select 1 from games where id = $1", [DUPE]);
	expect(gone.rows).toHaveLength(0);
	const session = await pool.query("select game_id from events where id = $1", [DUPE_SESSION]);
	expect(session.rows[0].game_id).toBe(HADES);
	// Drew's mark moved; Casey's wasn't duplicated.
	const marks = await pool.query("select user_id from game_interest where game_id = $1 and user_id in ('seed-drew', 'seed-casey') order by user_id", [HADES]);
	expect(marks.rows.map((row) => row.user_id)).toEqual(["seed-casey", "seed-drew"]);
	// The real game's status and history are untouched.
	const hades = await pool.query("select status, (select count(*)::int from game_status_history where game_id = $1) as history from games where id = $1", [HADES]);
	expect(hades.rows[0].status).toBe("completed");
	expect(hades.rows[0].history).toBeGreaterThan(0);
});

test("merging the played entry into an unplayed one is refused", async ({ page, context }) => {
	await signInAs(context, "seed-alex");
	await page.goto(`/backlog/${CELESTE}`);
	await page.getByText("Admin — merge a duplicate, or delete").click();
	await page.getByLabel("Keep this game").selectOption(VINTAGE_STORY);
	await page.getByLabel(/Merge “Celeste” into it/).check();
	await page.getByRole("button", { name: "Merge", exact: true }).click();
	await expect(page.getByText("open the other game and merge it into this one")).toBeVisible();
	const still = await pool.query("select 1 from games where id = $1", [CELESTE]);
	expect(still.rows).toHaveLength(1);
});

test("an admin deletes a typo proposal for good", async ({ page, context }) => {
	await signInAs(context, "seed-alex");
	await page.goto(`/backlog/${VINTAGE_STORY}`);
	await page.getByText("Admin — merge a duplicate, or delete").click();
	await page.getByLabel(/Delete “Vintage Story” permanently/).check();
	await page.getByRole("button", { name: "Delete game" }).click();

	await expect(page).toHaveURL(/\/backlog$/);
	await expect(page.getByRole("link", { name: "Vintage Story" })).toHaveCount(0);
	const gone = await pool.query("select (select count(*)::int from games where id = $1) as games, (select count(*)::int from game_status_history where game_id = $1) as history", [VINTAGE_STORY]);
	expect(gone.rows[0]).toEqual({ games: 0, history: 0 });
});
