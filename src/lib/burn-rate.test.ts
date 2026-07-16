import { describe, expect, it } from "vitest";

import {
	buildBurnRateSeries,
	projectCompletionDate,
	regressionSlope,
	type BurnRatePoint,
	type CompletionEvent,
} from "./burn-rate";

// Fixed "now" (a Thursday) keeps bucket math deterministic.
const NOW = new Date("2026-07-16T12:00:00Z");

function event(iso: string, points: number): CompletionEvent {
	return { changedAt: new Date(iso), points };
}

/** A perfectly steady series: `rate` points per week for `weeks` weeks. */
function steadySeries(weeks: number, rate: number): BurnRatePoint[] {
	return Array.from({ length: weeks }, (_, index) => ({
		bucketStart: `2026-01-${String(index + 1).padStart(2, "0")}`,
		label: `w${index}`,
		cumulativePoints: (index + 1) * rate,
	}));
}

describe("buildBurnRateSeries", () => {
	it("returns an empty series for no completions", () => {
		expect(buildBurnRateSeries([], { now: NOW })).toEqual([]);
	});

	it("accumulates points cumulatively across weekly buckets", () => {
		const series = buildBurnRateSeries(
			[
				event("2026-06-30T10:00:00Z", 3), // week of Mon Jun 29
				event("2026-07-07T10:00:00Z", 5), // week of Mon Jul 6
				event("2026-07-08T10:00:00Z", 2), // same week
			],
			{ bucket: "week", now: NOW }
		);
		// Jun 29, Jul 6, Jul 13 — every week up to "now" appears.
		expect(series).toHaveLength(3);
		expect(series.map((p) => p.cumulativePoints)).toEqual([3, 10, 10]);
		expect(series[0].bucketStart).toBe("2026-06-29");
	});

	it("keeps quiet weeks as flat buckets instead of skipping them", () => {
		const series = buildBurnRateSeries(
			[event("2026-06-01T10:00:00Z", 8)], // week of Mon Jun 1
			{ bucket: "week", now: NOW }
		);
		expect(series.length).toBeGreaterThan(5);
		expect(series.every((p) => p.cumulativePoints === 8)).toBe(true);
	});

	it("a trailing slice preserves the true cumulative height", () => {
		const events = [
			event("2026-01-05T10:00:00Z", 20), // long ago
			event("2026-07-07T10:00:00Z", 5),
		];
		const trailing = buildBurnRateSeries(events, { bucket: "week", trailing: 2, now: NOW });
		expect(trailing).toHaveLength(2);
		// The early 20 points are baked in, not dropped.
		expect(trailing[trailing.length - 1].cumulativePoints).toBe(25);
	});

	it("buckets by month with month-start dates", () => {
		const series = buildBurnRateSeries(
			[event("2026-05-15T10:00:00Z", 4), event("2026-07-01T10:00:00Z", 6)],
			{ bucket: "month", now: NOW }
		);
		expect(series.map((p) => p.bucketStart)).toEqual(["2026-05-01", "2026-06-01", "2026-07-01"]);
		expect(series.map((p) => p.cumulativePoints)).toEqual([4, 4, 10]);
	});
});

describe("regressionSlope", () => {
	it("recovers a steady weekly rate", () => {
		expect(regressionSlope(steadySeries(12, 5))).toBeCloseTo(5);
	});

	it("uses only the last 12 buckets", () => {
		// 12 flat buckets followed by 12 at rate 5: the flat prefix must not drag it down.
		const flat = steadySeries(12, 0).map((p) => ({ ...p, cumulativePoints: 0 }));
		const rising = steadySeries(12, 5);
		expect(regressionSlope([...flat, ...rising])).toBeCloseTo(5);
	});

	it("returns null for a flat series or too little data", () => {
		expect(regressionSlope(steadySeries(12, 0).map((p) => ({ ...p, cumulativePoints: 7 })))).toBeNull();
		expect(regressionSlope(steadySeries(1, 5))).toBeNull();
		expect(regressionSlope([])).toBeNull();
	});
});

describe("projectCompletionDate", () => {
	it("projects the finish date at the current pace", () => {
		const series = steadySeries(12, 5); // 5 pts/week, last bucket 2026-01-12
		const projection = projectCompletionDate(series, 70, 60);
		// 10 points left at 5/week → 2 weeks after the last bucket start.
		expect(projection).not.toBeNull();
		expect(projection!.weeklyRate).toBe(5);
		expect(projection!.date).toBe("2026-01-26");
	});

	it("returns null when done, when flat, or when the projection is noise (>156 weeks)", () => {
		const series = steadySeries(12, 5);
		expect(projectCompletionDate(series, 60, 60)).toBeNull(); // nothing left
		expect(projectCompletionDate(steadySeries(12, 0), 100, 0)).toBeNull(); // no trend
		expect(projectCompletionDate(series, 10_000, 0)).toBeNull(); // ~2000 weeks out
	});
});
