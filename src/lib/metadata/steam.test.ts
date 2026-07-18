import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveGameModes, steamProvider } from "./steam";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("deriveGameModes", () => {
	it("maps the stable category ids", () => {
		expect(
			deriveGameModes([
				{ id: 2, description: "Single-player" },
				{ id: 9, description: "Co-op" },
				{ id: 38, description: "Online Co-op" },
				{ id: 36, description: "Online PvP" },
			])
		).toEqual(["single-player", "co-op", "online-co-op", "pvp"]);
	});

	it("falls back to description matching for unknown ids", () => {
		expect(deriveGameModes([{ id: 999, description: "Shared/Split Screen Co-op" }])).toEqual([
			"local-co-op",
		]);
	});

	it("dedups modes and skips unrecognized categories", () => {
		expect(
			deriveGameModes([
				{ id: 36, description: "Online PvP" },
				{ id: 37, description: "Shared/Split Screen PvP" },
				{ id: 23, description: "Steam Cloud" },
			])
		).toEqual(["pvp"]);
	});

	it("distinguishes missing (undefined) from present-but-empty ([])", () => {
		expect(deriveGameModes(undefined)).toBeUndefined();
		expect(deriveGameModes([])).toEqual([]);
	});
});

// Captured shape of /api/appdetails + /appreviews (trimmed).
function stubSteam({ reviewsFail = false } = {}) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.includes("/api/appdetails")) {
			return Response.json({
				"367520": {
					success: true,
					data: {
						name: "Hollow Knight",
						short_description: "An epic action adventure.",
						header_image: "https://cdn.example/header.jpg",
						genres: [{ description: "Metroidvania" }, { description: "Action" }],
						categories: [{ id: 2, description: "Single-player" }],
						release_date: { coming_soon: false, date: "24 Feb, 2017" },
						metacritic: { score: 87 },
					},
				},
			});
		}
		if (url.includes("/appreviews/")) {
			if (reviewsFail) return new Response("nope", { status: 500 });
			return Response.json({ query_summary: { total_positive: 921, total_reviews: 1000 } });
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("steamProvider.fetchByExternalId", () => {
	it("normalizes appdetails + reviews into metadata", async () => {
		stubSteam();
		const metadata = await steamProvider.fetchByExternalId("367520");
		expect(metadata.title).toBe("Hollow Knight");
		expect(metadata.genres).toEqual(["Metroidvania", "Action"]);
		expect(metadata.gameModes).toEqual(["single-player"]);
		expect(metadata.releaseDate).toBe("2017-02-24");
		expect(metadata.metacriticScore).toBe(87);
		expect(metadata.steamReviewScore).toBe(92); // 921/1000 rounded
		expect(metadata.steamReviewCount).toBe(1000);
	});

	it("a failing reviews endpoint degrades to an unset score, not an error", async () => {
		stubSteam({ reviewsFail: true });
		const metadata = await steamProvider.fetchByExternalId("367520");
		expect(metadata.title).toBe("Hollow Knight");
		expect(metadata.steamReviewScore).toBeUndefined();
		expect(metadata.steamReviewCount).toBeUndefined();
	});

	it("throws when appdetails reports no data (bad app id)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ "999": { success: false } }))
		);
		await expect(steamProvider.fetchByExternalId("999")).rejects.toThrow(/no data/);
	});
});

describe("steamProvider.search", () => {
	it("maps storesearch items to candidates", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					items: [{ id: 367520, name: "Hollow Knight", tiny_image: "https://cdn.example/t.jpg" }],
				})
			)
		);
		const results = await steamProvider.search("hollow");
		expect(results).toEqual([
			{
				providerId: "steam",
				externalId: "367520",
				title: "Hollow Knight",
				coverUrl: "https://cdn.example/t.jpg",
			},
		]);
	});
});
