"use server";

import type { gameStatus } from "@/db/schema";

type GameStatus = (typeof gameStatus.enumValues)[number];

// TODO(Phase 2): propose a game — insert games row (status "proposed"),
// kick off fetchGameMetadata (src/lib/metadata), compute points via
// src/lib/points, write initial game_status_history entry.
export async function proposeGame(_input: {
	title: string;
	pitch?: string;
	steamAppId?: number;
}): Promise<{ gameId: string }> {
	throw new Error("proposeGame not implemented (Phase 2)");
}

// TODO(Phase 2): the ONLY way to change a game's status. Validates the
// transition, sets started_at/completed_at, appends game_status_history,
// and deletes votes when the game leaves "backlog" (frees vote budget).
export async function transitionGameStatus(_input: {
	gameId: string;
	toStatus: GameStatus;
}): Promise<void> {
	throw new Error("transitionGameStatus not implemented (Phase 2)");
}

// TODO(Phase 2): edit length/difficulty/points_override; recompute stored
// points on change.
export async function updateGameScoring(_input: {
	gameId: string;
	lengthHours?: number;
	difficulty?: number;
	pointsOverride?: number | null;
}): Promise<void> {
	throw new Error("updateGameScoring not implemented (Phase 2)");
}

// TODO(Phase 4): burn-rate series — cumulative completed points per week
// from game_status_history, plus a linear projection of completion date.
export async function getBurnRate(): Promise<
	{ weekStart: string; cumulativePoints: number }[]
> {
	throw new Error("getBurnRate not implemented (Phase 4)");
}
