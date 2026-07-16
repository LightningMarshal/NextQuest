import { describe, expect, it } from "vitest";

import {
	DEFAULT_DIFFICULTY_MULTIPLIERS,
	QUALITY_BASELINE,
	TTRPG_BAND_HOURS,
	computePoints,
	lengthPoints,
	qualityMultiplier,
	qualityScore,
	tabletopLengthHours,
	type Difficulty,
} from "./points";

describe("lengthPoints", () => {
	it("maps hours onto the fibonacci buckets", () => {
		expect(lengthPoints(1)).toBe(1);
		expect(lengthPoints(4.9)).toBe(1);
		expect(lengthPoints(5)).toBe(2); // bucket bounds are exclusive on the top
		expect(lengthPoints(11.9)).toBe(2);
		expect(lengthPoints(12)).toBe(3);
		expect(lengthPoints(24.9)).toBe(3);
		expect(lengthPoints(25)).toBe(5);
		expect(lengthPoints(49.9)).toBe(5);
		expect(lengthPoints(50)).toBe(8);
		expect(lengthPoints(99.9)).toBe(8);
		expect(lengthPoints(100)).toBe(13);
		expect(lengthPoints(500)).toBe(13);
	});

	it("dampens HLTB noise — nearby estimates land in the same bucket", () => {
		expect(lengthPoints(47)).toBe(lengthPoints(49.5));
	});

	it("rejects non-positive and non-finite hours", () => {
		expect(() => lengthPoints(0)).toThrow(RangeError);
		expect(() => lengthPoints(-3)).toThrow(RangeError);
		expect(() => lengthPoints(Number.NaN)).toThrow(RangeError);
		expect(() => lengthPoints(Infinity)).toThrow(RangeError);
	});
});

describe("tabletopLengthHours", () => {
	it("maps TTRPG bands to their representative hour-equivalents", () => {
		for (const [band, hours] of Object.entries(TTRPG_BAND_HOURS)) {
			expect(
				tabletopLengthHours({ gameType: "ttrpg", lengthBand: band as keyof typeof TTRPG_BAND_HOURS })
			).toBe(hours);
		}
	});

	it("band hour-equivalents land in the intended point buckets (1/3/5/13)", () => {
		expect(lengthPoints(TTRPG_BAND_HOURS.one_shot)).toBe(1);
		expect(lengthPoints(TTRPG_BAND_HOURS.arc)).toBe(3);
		expect(lengthPoints(TTRPG_BAND_HOURS.mini_campaign)).toBe(5);
		expect(lengthPoints(TTRPG_BAND_HOURS.campaign)).toBe(13);
	});

	it("converts board-game playtime minutes to hours, one decimal", () => {
		expect(tabletopLengthHours({ gameType: "boardgame", playtimeMinutes: 90 })).toBe(1.5);
		expect(tabletopLengthHours({ gameType: "boardgame", playtimeMinutes: 100 })).toBe(1.7);
	});

	it("returns undefined when the type's own length input is missing", () => {
		expect(tabletopLengthHours({ gameType: "ttrpg", playtimeMinutes: 90 })).toBeUndefined();
		expect(tabletopLengthHours({ gameType: "boardgame", lengthBand: "arc" })).toBeUndefined();
		expect(tabletopLengthHours({ gameType: "boardgame", playtimeMinutes: 0 })).toBeUndefined();
	});
});

describe("qualityScore", () => {
	it("averages the available signals", () => {
		expect(qualityScore({ steamReviewScore: 90, metacriticScore: 70 })).toBe(80);
		expect(qualityScore({ bggRating: 75 })).toBe(75);
	});

	it("ignores missing/non-finite signals and returns null when none exist", () => {
		expect(qualityScore({})).toBeNull();
		expect(qualityScore({ steamReviewScore: null, metacriticScore: undefined })).toBeNull();
		expect(qualityScore({ steamReviewScore: 80, metacriticScore: Number.NaN })).toBe(80);
	});
});

describe("qualityMultiplier", () => {
	it("is neutral with no data and at the baseline", () => {
		expect(qualityMultiplier(null, 1)).toBe(1);
		expect(qualityMultiplier(QUALITY_BASELINE, 0.5)).toBe(1);
	});

	it("scales the bonus/discount by the weight and clamps the weight to 0–1", () => {
		expect(qualityMultiplier(90, 0.5)).toBeCloseTo(1.1);
		expect(qualityMultiplier(50, 0.5)).toBeCloseTo(0.9);
		expect(qualityMultiplier(90, 0)).toBe(1); // weight 0 reproduces v1 exactly
		expect(qualityMultiplier(100, 5)).toBeCloseTo(1.3); // weight clamped to 1
	});

	it("clamps the multiplier to the 0.5–1.5 rails", () => {
		expect(qualityMultiplier(0, 1)).toBe(0.5);
		expect(qualityMultiplier(100, 1)).toBeLessThanOrEqual(1.5);
	});
});

describe("computePoints", () => {
	it("multiplies length points by the difficulty multiplier", () => {
		// 30h → 5 pts; D4 ×1.5 → 7.5 → 8
		expect(computePoints(30, 4)).toBe(8);
		// 3h → 1 pt; D1 ×0.8 → 0.8 → 1 (floor of 1)
		expect(computePoints(3, 1)).toBe(1);
	});

	it("never returns less than 1 point", () => {
		expect(computePoints(1, 1, { ...DEFAULT_DIFFICULTY_MULTIPLIERS, 1: 0.1 })).toBe(1);
	});

	it("applies the quality factor only when signals exist", () => {
		const base = computePoints(60, 3); // 8 × 1.2 = 9.6 → 10
		expect(base).toBe(10);
		expect(computePoints(60, 3, undefined, { weight: 0.5, signals: {} })).toBe(base);
		// q=100: ×(1 + 0.5×0.3) = ×1.15 → 9.6×1.15 = 11.04 → 11
		expect(
			computePoints(60, 3, undefined, { weight: 0.5, signals: { steamReviewScore: 100 } })
		).toBe(11);
	});

	it("throws on a difficulty with no configured multiplier", () => {
		expect(() => computePoints(10, 7 as Difficulty)).toThrow(RangeError);
	});
});
