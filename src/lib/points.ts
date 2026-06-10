// Points formula: points = lengthPoints(hours) × difficultyMultiplier.
// Pure functions only — used by server actions and tests. Points are STORED
// on the game row and recomputed only on explicit edit, so completed games
// keep their historical value even if the formula is tuned later.
// Rationale: docs/DECISIONS.md.

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type DifficultyMultipliers = Record<Difficulty, number>;

export const DEFAULT_DIFFICULTY_MULTIPLIERS: DifficultyMultipliers = {
	1: 0.8,
	2: 1.0,
	3: 1.2,
	4: 1.5,
	5: 2.0,
};

// Fibonacci buckets (sprint-pointing style) dampen HLTB noise: a 47h vs 52h
// estimate shouldn't swing the score.
const LENGTH_BUCKETS: ReadonlyArray<{ maxHours: number; points: number }> = [
	{ maxHours: 5, points: 1 },
	{ maxHours: 12, points: 2 },
	{ maxHours: 25, points: 3 },
	{ maxHours: 50, points: 5 },
	{ maxHours: 100, points: 8 },
	{ maxHours: Infinity, points: 13 },
];

export function lengthPoints(hours: number): number {
	if (!Number.isFinite(hours) || hours <= 0) {
		throw new RangeError(`length hours must be a positive number, got ${hours}`);
	}
	return LENGTH_BUCKETS.find((bucket) => hours < bucket.maxHours)?.points ?? 13;
}

export function computePoints(
	hours: number,
	difficulty: Difficulty,
	multipliers: DifficultyMultipliers = DEFAULT_DIFFICULTY_MULTIPLIERS
): number {
	const multiplier = multipliers[difficulty];
	if (multiplier === undefined) {
		throw new RangeError(`no multiplier configured for difficulty ${difficulty}`);
	}
	return Math.round(lengthPoints(hours) * multiplier);
}
