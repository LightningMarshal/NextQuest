import { describe, expect, it } from "vitest";

import {
	CELL_MS,
	bestWindows,
	cellsToIntervals,
	covers,
	mergeIntervals,
	overlaps,
	type Interval,
} from "./availability-grid";

const at = (iso: string) => new Date(iso);
const span = (start: string, end: string): Interval => ({ startsAt: at(start), endsAt: at(end) });

describe("mergeIntervals", () => {
	it("merges touching and overlapping intervals", () => {
		const merged = mergeIntervals([
			span("2026-08-01T18:00:00Z", "2026-08-01T18:30:00Z"),
			span("2026-08-01T18:30:00Z", "2026-08-01T19:00:00Z"),
			span("2026-08-01T18:45:00Z", "2026-08-01T19:15:00Z"),
			span("2026-08-01T21:00:00Z", "2026-08-01T22:00:00Z"),
		]);
		expect(merged).toEqual([
			span("2026-08-01T18:00:00Z", "2026-08-01T19:15:00Z"),
			span("2026-08-01T21:00:00Z", "2026-08-01T22:00:00Z"),
		]);
	});

	it("drops empty intervals and sorts", () => {
		const merged = mergeIntervals([
			span("2026-08-01T20:00:00Z", "2026-08-01T20:00:00Z"),
			span("2026-08-01T19:00:00Z", "2026-08-01T19:15:00Z"),
		]);
		expect(merged).toEqual([span("2026-08-01T19:00:00Z", "2026-08-01T19:15:00Z")]);
	});
});

describe("cellsToIntervals", () => {
	it("collapses adjacent painted cells into one interval", () => {
		const base = at("2026-08-01T18:00:00Z").getTime();
		const intervals = cellsToIntervals([base, base + CELL_MS, base + 3 * CELL_MS]);
		expect(intervals).toEqual([
			span("2026-08-01T18:00:00Z", "2026-08-01T18:30:00Z"),
			span("2026-08-01T18:45:00Z", "2026-08-01T19:00:00Z"),
		]);
	});
});

describe("covers / overlaps", () => {
	const marks = [
		span("2026-08-01T18:00:00Z", "2026-08-01T19:00:00Z"),
		span("2026-08-01T19:00:00Z", "2026-08-01T20:00:00Z"),
	];
	it("covers across merged boundaries", () => {
		expect(covers(marks, at("2026-08-01T18:30:00Z"), at("2026-08-01T19:30:00Z"))).toBe(true);
		expect(covers(marks, at("2026-08-01T18:30:00Z"), at("2026-08-01T20:30:00Z"))).toBe(false);
	});
	it("overlaps is looser than covers", () => {
		expect(overlaps(marks, at("2026-08-01T19:45:00Z"), at("2026-08-01T21:00:00Z"))).toBe(true);
		expect(overlaps(marks, at("2026-08-01T20:00:00Z"), at("2026-08-01T21:00:00Z"))).toBe(false);
	});
});

describe("bestWindows", () => {
	const window = [span("2026-08-01T17:00:00Z", "2026-08-01T23:00:00Z")];

	it("finds the span the most members fully cover", () => {
		const suggestions = bestWindows(
			window,
			[
				{ userId: "a", intervals: [span("2026-08-01T18:00:00Z", "2026-08-01T22:00:00Z")] },
				{ userId: "b", intervals: [span("2026-08-01T19:00:00Z", "2026-08-01T23:00:00Z")] },
				{ userId: "c", intervals: [span("2026-08-01T17:00:00Z", "2026-08-01T19:00:00Z")] },
			],
			120
		);
		expect(suggestions[0]).toMatchObject({
			startsAt: at("2026-08-01T19:00:00Z"),
			endsAt: at("2026-08-01T21:00:00Z"),
			available: ["a", "b"],
		});
	});

	it("prefers the earlier start on ties", () => {
		const suggestions = bestWindows(
			window,
			[{ userId: "a", intervals: [span("2026-08-01T18:00:00Z", "2026-08-01T22:00:00Z")] }],
			60
		);
		expect(suggestions[0].startsAt).toEqual(at("2026-08-01T18:00:00Z"));
	});

	it("returns non-overlapping suggestions", () => {
		const suggestions = bestWindows(
			window,
			[{ userId: "a", intervals: [span("2026-08-01T17:00:00Z", "2026-08-01T23:00:00Z")] }],
			120,
			3
		);
		expect(suggestions).toHaveLength(3);
		for (let i = 1; i < suggestions.length; i++) {
			expect(suggestions[i].startsAt.getTime()).toBeGreaterThanOrEqual(
				suggestions[i - 1].endsAt.getTime()
			);
		}
	});

	it("skips spans nobody covers and respects window bounds", () => {
		const suggestions = bestWindows(
			[span("2026-08-01T17:00:00Z", "2026-08-01T18:00:00Z")],
			[{ userId: "a", intervals: [span("2026-08-01T17:00:00Z", "2026-08-01T17:30:00Z")] }],
			120
		);
		expect(suggestions).toHaveLength(0);
	});

	it("partial overlap does not count as available", () => {
		const suggestions = bestWindows(
			window,
			[
				{ userId: "a", intervals: [span("2026-08-01T18:00:00Z", "2026-08-01T20:00:00Z")] },
				{ userId: "b", intervals: [span("2026-08-01T19:00:00Z", "2026-08-01T19:30:00Z")] },
			],
			120
		);
		expect(suggestions[0].available).toEqual(["a"]);
	});
});
