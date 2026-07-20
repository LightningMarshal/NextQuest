import { describe, expect, it } from "vitest";

import { averageRating, pickGoty } from "./ratings";

describe("averageRating", () => {
	it("rounds to one decimal", () => {
		expect(averageRating([5, 4, 4])).toBe(4.3);
		expect(averageRating([3])).toBe(3);
	});
	it("is null for no ratings", () => {
		expect(averageRating([])).toBeNull();
	});
});

describe("pickGoty", () => {
	it("picks the highest average among qualified games", () => {
		expect(
			pickGoty([
				{ gameId: "a", ratings: [5, 3] },
				{ gameId: "b", ratings: [5, 5] },
				{ gameId: "c", ratings: [4, 4, 4] },
			])
		).toEqual({ gameId: "b", average: 5, count: 2 });
	});

	it("ignores games under the raters floor — one enthusiast is not a GOTY", () => {
		expect(
			pickGoty([
				{ gameId: "solo", ratings: [5] },
				{ gameId: "pair", ratings: [4, 4] },
			])
		).toEqual({ gameId: "pair", average: 4, count: 2 });
	});

	it("breaks average ties toward more raters", () => {
		expect(
			pickGoty([
				{ gameId: "two", ratings: [4, 4] },
				{ gameId: "three", ratings: [4, 4, 4] },
			])?.gameId
		).toBe("three");
	});

	it("returns null when nothing qualifies", () => {
		expect(pickGoty([{ gameId: "solo", ratings: [5] }])).toBeNull();
		expect(pickGoty([])).toBeNull();
	});
});
