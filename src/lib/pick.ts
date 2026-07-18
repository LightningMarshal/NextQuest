// The picker: session-aware composite ranking over the backlog.
//   score = 100 × Σ ŵᵢ·cᵢ   (ŵ = admin weights renormalized over the
//   components active for this session's context; each cᵢ is 0–1)
// Unlike points (src/lib/points.ts), pick scores are computed at READ time
// and NEVER stored — the ranking is free to change as votes move, metadata
// refreshes, or the weights are retuned, and burn-rate history can't be
// rewritten because nothing here persists. Pure functions only — the server
// assembles inputs (vote tallies stay aggregate-only; anonymity invariant
// untouched). Rationale: docs/DECISIONS.md.

import { qualityScore, type QualitySignals } from "./points";

/** Derived from Steam appdetails categories; null column = never derived. */
export type GameMode =
	| "single-player"
	| "multi-player"
	| "co-op"
	| "online-co-op"
	| "local-co-op"
	| "pvp";

/** How big a game the group wants to start — maps to Main+Extra hour ranges. */
export type Commitment = "snack" | "weeknight" | "standard" | "epic" | "any";

/**
 * "What kind of night is it?" — a FILTER over the backlog, deliberately not
 * a scored component: board-game night vs. starting a campaign are different
 * questions, and blending them into one score would just mush the ranking.
 */
export type PickKind = "any" | "video" | "ttrpg" | "boardgame";

export type SessionContext = {
	/** Hours available tonight — enables the "finishable tonight" boost. */
	sessionHours?: number;
	commitment: Commitment;
	/** How many people are playing (only meaningful with `together`). */
	players?: number;
	/** Playing one game together vs. picking for the shared backlog. */
	together: boolean;
	kind: PickKind;
	/** Genre filter (metadata.genres) — like kind, a filter, not a component. */
	genre?: string;
};

export type PickWeights = {
	interest: number;
	quality: number;
	timeFit: number;
	staleness: number;
	partyFit: number;
};

export type PickComponentKey = keyof PickWeights;

export const DEFAULT_PICK_WEIGHTS: PickWeights = {
	interest: 0.35,
	timeFit: 0.25,
	quality: 0.15,
	staleness: 0.15,
	partyFit: 0.1,
};

export const COMMITMENT_RANGES: Record<Commitment, { min: number; max: number } | null> = {
	snack: { min: 0, max: 8 },
	weeknight: { min: 8, max: 25 },
	standard: { min: 25, max: 60 },
	epic: { min: 60, max: Infinity },
	any: null,
};

/** Everything the scorer needs about one backlog game. */
export type PickableGame = {
	gameId: string;
	gameType: "video" | "ttrpg" | "boardgame";
	/** HLTB Main+Extra for video; band/playtime hour-equivalent for tabletop. */
	lengthHours: number | null;
	signals: QualitySignals;
	/** Aggregate vote weight — from getVoteTally(), never per-member. */
	tally: number;
	/** Latest transition into `backlog`; null falls back to "just arrived". */
	backlogSince: Date | null;
	gameModes: GameMode[] | null;
	/** Tabletop min/max players — real data, unlike video's derived modes. */
	playerRange: { min: number | null; max: number | null } | null;
};

export type PickComponent = {
	key: PickComponentKey;
	/** Raw component value, 0–1. */
	value: number;
	/** Renormalized weight actually applied, 0–1 (active components sum to 1). */
	weight: number;
};

export type RankedGame = {
	gameId: string;
	/** 0–100, one decimal. */
	score: number;
	components: PickComponent[];
};

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/** Relative group interest: share of the strongest tally. 0 when nobody has voted. */
export function interestComponent(tally: number, maxTally: number): number {
	if (maxTally <= 0) return 0;
	return clamp01(tally / maxTally);
}

// Maps q 40→0 and q 100→1. Note the deliberate difference from the points
// formula: there missing review data is neutral (×1.0 multiplier); here it
// maps to 0.5 — "we know nothing" ranks between acclaimed and panned.
export function qualityComponent(q: number | null): number {
	if (q === null) return 0.5;
	return clamp01((q - 40) / 60);
}

// In-range → 1; outside, decay by log2 distance from the violated bound so
// "slightly too long" barely hurts but a 100h epic scores ~0 for a snack
// night. A game finishable in tonight's session is always a strong fit.
export function timeFitComponent(
	lengthHours: number | null,
	ctx: Pick<SessionContext, "sessionHours" | "commitment">
): number {
	let fit: number;
	if (lengthHours === null || lengthHours <= 0) {
		fit = 0.5; // unscored — neutral, never buried or boosted
	} else {
		const range = COMMITMENT_RANGES[ctx.commitment];
		if (range === null) {
			fit = 1;
		} else if (lengthHours >= range.min && lengthHours < range.max) {
			fit = 1;
		} else {
			const bound = lengthHours < range.min ? range.min : range.max;
			fit = Math.max(0, 1 - Math.abs(Math.log2(lengthHours / bound)) / 1.5);
		}
	}
	if (
		lengthHours !== null &&
		lengthHours > 0 &&
		ctx.sessionHours !== undefined &&
		ctx.sessionHours > 0 &&
		lengthHours <= ctx.sessionHours * 1.25
	) {
		fit = Math.max(fit, 0.95);
	}
	return fit;
}

/** Ramps 0→1 over 120 days in the backlog — old proposals stop being invisible. */
export function stalenessComponent(backlogSince: Date | null, now: Date): number {
	if (backlogSince === null) return 0;
	const days = (now.getTime() - backlogSince.getTime()) / (24 * 60 * 60 * 1000);
	if (!Number.isFinite(days) || days <= 0) return 0;
	return Math.min(1, days / 120);
}

const GROUP_MODES: ReadonlyArray<GameMode> = [
	"multi-player",
	"co-op",
	"online-co-op",
	"local-co-op",
];

// null (never derived) and [] (derived, nothing recognized) both mean
// "unknown" — neutral rather than punished, so missing Steam data can't
// bury a game. Tabletop games use their declared player range instead:
// that's real structured data, so the penalties can be sharper.
export function partyFitComponent(
	game: Pick<PickableGame, "gameType" | "gameModes" | "playerRange">,
	players?: number
): number {
	if (game.gameType !== "video") {
		const range = game.playerRange;
		if (!range || (range.min === null && range.max === null) || !players) return 0.5;
		if (range.min !== null && players < range.min) return 0.05; // can't even start
		if (range.max !== null && players > range.max) return 0.3; // someone sits out
		return 1;
	}
	const modes = game.gameModes;
	if (modes === null || modes.length === 0) return 0.5;
	if (modes.some((mode) => GROUP_MODES.includes(mode))) return 1;
	return 0.1; // single-player/pvp only — a poor pick for playing together
}

function isPartyFitActive(ctx: SessionContext): boolean {
	return ctx.together && (ctx.players ?? 0) >= 2;
}

// --- "Why this?" ------------------------------------------------------------
// A one-liner per ranked game so the composite score never reads as a black
// box: name the strongest contributor, back it with standout factors, and
// admit what drags the score down. Pure and read-time like the score itself.

export type PickExplanationInput = {
	/** The ranked game's components — only the active ones, as scored. */
	components: PickComponent[];
	/** Aggregate vote total — distinguishes "no votes yet" from "low share". */
	tally: number;
	backlogSince: Date | null;
	gameType: PickableGame["gameType"];
	/** Whether tonight's hours were given — phrasing only. */
	hasSessionHours: boolean;
};

const DRIVER_MIN_VALUE = 0.5;
const STANDOUT_MIN_VALUE = 0.8;
const DRAG_MAX_VALUE = 0.25;

function waitingPhrase(backlogSince: Date | null, now: Date): string {
	if (!backlogSince) return "been on the shelf a while";
	const months = Math.floor(
		(now.getTime() - backlogSince.getTime()) / (30 * 24 * 60 * 60 * 1000)
	);
	return months >= 2 ? `waiting ${months} months` : "been on the shelf a while";
}

/**
 * Explain one ranked game as a short " · "-joined line. Always returns a
 * non-empty string — a game with nothing remarkable says so explicitly.
 */
export function explainPick(input: PickExplanationInput, now: Date = new Date()): string {
	const byKey = new Map(input.components.map((component) => [component.key, component]));
	const get = (key: PickComponentKey) => byKey.get(key);

	// The driver: largest weighted contribution, provided the component is
	// actually good — a "best of a bad lot" factor shouldn't lead the line.
	const driver = [...input.components]
		.filter((component) => component.value >= DRIVER_MIN_VALUE && component.weight > 0)
		.sort((a, b) => b.weight * b.value - a.weight * a.value)[0];

	const driverPhrases: Record<PickComponentKey, () => string> = {
		interest: () => "the group's votes put it here",
		quality: () => "reviews carry it",
		timeFit: () =>
			input.hasSessionHours && (get("timeFit")?.value ?? 0) >= 0.95
				? "finishable tonight"
				: "the length fits the plan",
		staleness: () => waitingPhrase(input.backlogSince, now),
		partyFit: () =>
			input.gameType === "video" ? "built for playing together" : "fits your player count",
	};

	const standoutPhrases: Record<PickComponentKey, () => string> = {
		interest: () => "strong group votes",
		quality: () => "acclaimed",
		timeFit: () => (input.hasSessionHours ? "fits tonight's window" : "right length"),
		staleness: () => waitingPhrase(input.backlogSince, now),
		partyFit: () => (input.gameType === "video" ? "plays together" : "fits your player count"),
	};

	// Staleness is never a drag — arriving recently isn't a flaw. A missing
	// quality/timeFit/partyFit signal scores 0.5 (neutral), so "we don't
	// know" can never be phrased as a defect either.
	const dragPhrases: Partial<Record<PickComponentKey, () => string>> = {
		interest: () => (input.tally === 0 ? "no votes yet" : "few votes so far"),
		quality: () => "middling reviews",
		timeFit: () => "the length doesn't fit the plan",
		partyFit: () =>
			input.gameType === "video" ? "single-player only" : "awkward player count",
	};

	const phrases: string[] = [];
	if (driver) phrases.push(driverPhrases[driver.key]());
	for (const component of input.components) {
		if (phrases.length >= 3) break;
		if (component.key === driver?.key) continue;
		if (component.value >= STANDOUT_MIN_VALUE) {
			phrases.push(standoutPhrases[component.key]());
		}
	}
	const drags = input.components
		.filter(
			(component) =>
				component.key !== driver?.key &&
				component.value <= DRAG_MAX_VALUE &&
				component.weight > 0 &&
				dragPhrases[component.key]
		)
		.slice(0, 2)
		.map((component) => dragPhrases[component.key]!());
	phrases.push(...drags);

	if (phrases.length === 0) return "middle of the pack on every factor";
	return phrases.join(" · ");
}

/**
 * Rank the backlog for a session context. The sort is stable, so equal
 * scores keep the input order — pre-sort the input by title for a
 * human-sensible tie order.
 */
export function scoreBacklog(
	games: PickableGame[],
	ctx: SessionContext,
	weights: PickWeights = DEFAULT_PICK_WEIGHTS,
	now: Date = new Date()
): RankedGame[] {
	const maxTally = games.reduce((max, game) => Math.max(max, game.tally), 0);
	const activeKeys: PickComponentKey[] = ["interest", "quality", "timeFit", "staleness"];
	if (isPartyFitActive(ctx)) activeKeys.push("partyFit");

	const activeTotal = activeKeys.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
	const normalized = new Map<PickComponentKey, number>(
		activeKeys.map((key) => [
			key,
			// All-zero weights degrade to an even split instead of NaN.
			activeTotal > 0 ? Math.max(0, weights[key]) / activeTotal : 1 / activeKeys.length,
		])
	);

	return games
		.map((game) => {
			const values: Record<PickComponentKey, number> = {
				interest: interestComponent(game.tally, maxTally),
				quality: qualityComponent(qualityScore(game.signals)),
				timeFit: timeFitComponent(game.lengthHours, ctx),
				staleness: stalenessComponent(game.backlogSince, now),
				partyFit: partyFitComponent(game, ctx.players),
			};
			const components: PickComponent[] = activeKeys.map((key) => ({
				key,
				value: values[key],
				weight: normalized.get(key) ?? 0,
			}));
			const score = components.reduce(
				(sum, component) => sum + component.weight * component.value,
				0
			);
			return {
				gameId: game.gameId,
				score: Math.round(score * 1000) / 10,
				components,
			};
		})
		.sort((a, b) => b.score - a.score);
}
