// Pure helpers for member game ratings (Phase 21). Ratings are 1–5 integers,
// public within the group. Nothing here feeds the effort formula or the
// picker — member ratings are a voice, not a scoring input (yet; community
// crunch may build on them later).

export type RatingValue = 1 | 2 | 3 | 4 | 5;

/** Mean to one decimal; null for an empty list. */
export function averageRating(ratings: number[]): number | null {
	if (ratings.length === 0) return null;
	return Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10;
}

export type GotyCandidate = {
	gameId: string;
	ratings: number[];
};

export type GotyResult = {
	gameId: string;
	average: number;
	count: number;
};

/** Minimum raters before an average means anything — one enthusiast isn't a GOTY. */
export const GOTY_MIN_RATERS = 2;

/**
 * Group game-of-the-year: highest average member rating among games with at
 * least `minRaters` ratings. Ties break toward more raters, then stable
 * input order (pass candidates in completion order).
 */
export function pickGoty(
	candidates: GotyCandidate[],
	minRaters: number = GOTY_MIN_RATERS
): GotyResult | null {
	const qualified = candidates
		.filter((candidate) => candidate.ratings.length >= minRaters)
		.map((candidate) => ({
			gameId: candidate.gameId,
			average: averageRating(candidate.ratings) as number,
			count: candidate.ratings.length,
		}));
	if (qualified.length === 0) return null;
	return qualified.reduce((best, candidate) =>
		candidate.average > best.average ||
		(candidate.average === best.average && candidate.count > best.count)
			? candidate
			: best
	);
}
