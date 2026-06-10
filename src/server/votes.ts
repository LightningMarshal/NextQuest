"use server";

// ANONYMITY INVARIANT (see src/db/schema/votes.ts): nothing in this module
// may ever return another member's user_id or per-user allocations. Tallies
// are {gameId, totalWeight} aggregates only.

// TODO(Phase 3): upsert the calling member's allocation for one game.
// Validates: game is in "backlog", weight <= vote_max_per_game, and the
// member's total across all games <= vote_budget (app_settings).
export async function setVote(_input: { gameId: string; weight: number }): Promise<void> {
	throw new Error("setVote not implemented (Phase 3)");
}

// TODO(Phase 3): the calling member's own ballot + remaining budget.
export async function getMyBallot(): Promise<{
	allocations: { gameId: string; weight: number }[];
	remainingBudget: number;
}> {
	throw new Error("getMyBallot not implemented (Phase 3)");
}

// TODO(Phase 3): aggregate priority order for the backlog.
export async function getVoteTally(): Promise<{ gameId: string; totalWeight: number }[]> {
	throw new Error("getVoteTally not implemented (Phase 3)");
}
