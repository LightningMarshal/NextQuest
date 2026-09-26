// Server-only core of the game lifecycle (NOT "use server" — exporting from
// one would mint a POST endpoint that skips the caller's gate). The public
// action is transitionGameStatus in games.ts; keen auto-promotion calls this
// directly. Either way, THIS is the only writer of games.status
// (CLAUDE.md invariant #3), and it always appends game_status_history.

import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

export type GameStatus = (typeof schema.gameStatus.enumValues)[number];

// The full lifecycle. Anything not listed here is an illegal transition.
// proposed → playing is allowed: "we just started it" shouldn't need a
// detour through the backlog.
export const ALLOWED_TRANSITIONS: Record<GameStatus, GameStatus[]> = {
	proposed: ["backlog", "playing", "rejected"],
	backlog: ["playing", "abandoned"],
	playing: ["completed", "backlog", "abandoned"],
	completed: [],
	abandoned: ["backlog"],
	rejected: ["proposed"],
};

export type TransitionResult =
	| { ok: true; title: string; from: GameStatus }
	| { ok: false; reason: string };

/**
 * Validate and apply one transition. The status update and its history row
 * are ONE statement (a data-modifying CTE), so a double-submitted click or
 * a concurrent transition can never append history for a move that didn't
 * happen — the second writer's `where status = from` matches nothing and
 * inserts nothing.
 */
export async function applyStatusTransition(
	db: ReturnType<typeof getDb>,
	gameId: string,
	toStatus: GameStatus,
	actorId: string | null
): Promise<TransitionResult> {
	const [game] = await db
		.select({ status: schema.games.status, title: schema.games.title })
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	if (!game) return { ok: false, reason: "Game not found." };
	if (!ALLOWED_TRANSITIONS[game.status].includes(toStatus)) {
		return { ok: false, reason: `Can't move a ${game.status} game to ${toStatus}.` };
	}

	const now = new Date();
	const moved = await db.execute(sql`
		with moved as (
			update ${schema.games}
			set status = ${toStatus}::game_status,
				started_at = case when ${toStatus}::text = 'playing' then ${now}::timestamptz else started_at end,
				completed_at = case when ${toStatus}::text = 'completed' then ${now}::timestamptz else completed_at end,
				updated_at = ${now}::timestamptz
			where id = ${gameId} and status = ${game.status}
			returning id
		)
		insert into ${schema.gameStatusHistory} (game_id, from_status, to_status, changed_by, changed_at)
		select id, ${game.status}::game_status, ${toStatus}::game_status, ${actorId}::text, ${now}::timestamptz from moved
		returning game_id
	`);
	if (moved.rows.length === 0) {
		return { ok: false, reason: "Someone else just changed this game — refresh and try again." };
	}

	// Legacy budget votes are cleared when a game leaves the backlog, exactly
	// as before (the ballot UI is retired, but the rule keeps stored data sane).
	if (game.status === "backlog") {
		await db.delete(schema.votes).where(eq(schema.votes.gameId, gameId));
	}
	return { ok: true, title: game.title, from: game.status };
}
