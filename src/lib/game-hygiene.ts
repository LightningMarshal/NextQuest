// Pure rules for the admin clean-up tools on a game page
// (src/server/game-admin.ts): what may be hard-deleted, and which way a
// merge of two duplicate entries has to go.

export type HygieneStatus = "proposed" | "backlog" | "playing" | "completed" | "abandoned" | "rejected";

/** Statuses a game only reaches by actually being played. */
function wasPlayed(game: { status: HygieneStatus; startedAt: Date | null }): boolean {
	return game.status === "playing" || game.status === "completed" || game.startedAt !== null;
}

/**
 * Hard delete is for spam, typos and accidental proposals. A game the group
 * played carries status history (which feeds burn-rate and the activity
 * feed) and sessions — deleting it would punch a hole in the record, so
 * those are merged or abandoned instead. Returns why not, or null if fine.
 */
export function deleteBlocker(game: { status: HygieneStatus; startedAt: Date | null }, sessionsPlayed: number): string | null {
	if (wasPlayed(game)) {
		return "This game has been played — its history feeds the stats. Merge it into its duplicate, or mark it abandoned.";
	}
	if (sessionsPlayed > 0) {
		return `${sessionsPlayed} played session${sessionsPlayed === 1 ? " is" : "s are"} recorded against this game. Merge it into the right one instead.`;
	}
	return null;
}

/**
 * A merge keeps the TARGET's status and history and folds everything else
 * in (sessions, "I'd play this", ratings, comments, tags). So the entry
 * with the real history must be the one that survives: merging a played
 * game into an unplayed duplicate would erase that it was ever played.
 */
export function mergeBlocker(
	source: { id: string; status: HygieneStatus; startedAt: Date | null },
	target: { id: string; status: HygieneStatus; startedAt: Date | null }
): string | null {
	if (source.id === target.id) return "Pick a different game to merge into.";
	if (wasPlayed(source) && !wasPlayed(target)) {
		return "This entry has the play history, so it should be the one that's kept — open the other game and merge it into this one.";
	}
	return null;
}
