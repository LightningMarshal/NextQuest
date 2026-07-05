// Points formula (v2):
//   points = max(1, round(lengthPoints(hours) × difficultyMultiplier × qualityMultiplier))
// where the quality multiplier rewards finishing acclaimed games, derived
// from Steam review % and Metacritic when available. Pure functions only —
// used by server actions and tests. Points are STORED on the game row and
// recomputed only on explicit edit (or the admin recompute action for
// pre-play games), so completed games keep their historical value even if
// the formula is tuned later. Rationale: docs/DECISIONS.md.

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

// --- Tabletop hour-equivalents ---------------------------------------------
// TTRPGs have no HowLongToBeat: length is proposed as a descriptive band and
// converted to a representative hour-equivalent stored in games.length_hours.
// The representative values are chosen to land in the buckets above
// (one-shot→1, arc→3, mini-campaign→5, campaign→13 pts), so the formula and
// every stored-points rule apply unchanged. Bands are the only display
// surface — the UI never shows raw hours for tabletop games.

export type TtrpgLengthBand = "one_shot" | "arc" | "mini_campaign" | "campaign";

export const TTRPG_BAND_HOURS: Record<TtrpgLengthBand, number> = {
	one_shot: 4,
	arc: 15,
	mini_campaign: 35,
	campaign: 110,
};

export const TTRPG_BAND_LABELS: Record<TtrpgLengthBand, string> = {
	one_shot: "One-shot (single session)",
	arc: "Arc (2–5 sessions)",
	mini_campaign: "Mini-campaign (6–12 sessions)",
	campaign: "Campaign (months+)",
};

/** Hour-equivalent for a tabletop game: band for TTRPGs, minutes for board games. */
export function tabletopLengthHours(input: {
	gameType: "ttrpg" | "boardgame";
	lengthBand?: TtrpgLengthBand | null;
	playtimeMinutes?: number | null;
}): number | undefined {
	if (input.gameType === "ttrpg") {
		return input.lengthBand ? TTRPG_BAND_HOURS[input.lengthBand] : undefined;
	}
	return input.playtimeMinutes && input.playtimeMinutes > 0
		? Math.round((input.playtimeMinutes / 60) * 10) / 10
		: undefined;
}

// Quality factor: a game rated at the baseline (a "decent game") is neutral;
// better-reviewed games earn a bonus, worse ones a discount. The admin-tuned
// weight (0–1, app_settings.quality_weight) scales the effect; 0 disables it
// and reproduces the v1 formula exactly.
export const QUALITY_BASELINE = 70;
export const DEFAULT_QUALITY_WEIGHT = 0.5;
const QUALITY_MULTIPLIER_MIN = 0.5;
const QUALITY_MULTIPLIER_MAX = 1.5;

export type QualitySignals = {
	/** Steam "% positive", 0–100. */
	steamReviewScore?: number | null;
	/** Metacritic metascore, 0–100. */
	metacriticScore?: number | null;
};

/** Mean of the available signals clamped to 0–100; null when both missing. */
export function qualityScore(signals: QualitySignals): number | null {
	const values = [signals.steamReviewScore, signals.metacriticScore].filter(
		(value): value is number => typeof value === "number" && Number.isFinite(value)
	);
	if (values.length === 0) return null;
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	return Math.min(100, Math.max(0, mean));
}

/** 1 + weight × (q − baseline)/100, clamped — q null (no data) is neutral. */
export function qualityMultiplier(q: number | null, weight: number): number {
	if (q === null) return 1;
	const clampedWeight = Math.min(1, Math.max(0, weight));
	const multiplier = 1 + clampedWeight * ((q - QUALITY_BASELINE) / 100);
	return Math.min(QUALITY_MULTIPLIER_MAX, Math.max(QUALITY_MULTIPLIER_MIN, multiplier));
}

export function computePoints(
	hours: number,
	difficulty: Difficulty,
	multipliers: DifficultyMultipliers = DEFAULT_DIFFICULTY_MULTIPLIERS,
	quality?: { weight: number; signals: QualitySignals }
): number {
	const multiplier = multipliers[difficulty];
	if (multiplier === undefined) {
		throw new RangeError(`no multiplier configured for difficulty ${difficulty}`);
	}
	const qualityFactor = quality
		? qualityMultiplier(qualityScore(quality.signals), quality.weight)
		: 1;
	// Floor of 1: a finished game is never worth zero points.
	return Math.max(1, Math.round(lengthPoints(hours) * multiplier * qualityFactor));
}
