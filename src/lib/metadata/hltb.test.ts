import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchHltbTimesById, fetchHltbTimesByTitle, hltbProvider } from "./hltb";

// These tests drive the full discovery → /init handshake → POST search flow
// against a stubbed fetch that mimics HLTB's current scheme, including the
// two historical breakage modes: the pages/_app chunk disappearing (app-router
// style bundles) and a discovered endpoint the API rejects (stale bundle).

const RESULTS = [
	{
		game_id: 26286,
		game_name: "Hollow Knight",
		game_image: "hk.jpg",
		release_world: 2017,
		comp_main: 95400, // 26.5h
		comp_plus: 143640, // 39.9h
		comp_100: 227160, // 63.1h
	},
	{
		game_id: 42069,
		game_name: "Hollow Knight: Silksong",
		comp_main: 108000, // 30h
	},
];

type StubOptions = {
	/** Serve an app-router-style chunk path with no pages/_app chunk. */
	noAppChunk?: boolean;
	/** The bundle advertises a stale endpoint that 404s; only /api/s works. */
	staleEndpoint?: boolean;
};

function stubHltb({ noAppChunk = false, staleEndpoint = false }: StubOptions = {}) {
	const searchCalls: { path: string; headers: Record<string, string>; payload: unknown }[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const path = url.pathname;

		if (path === "/") {
			const chunk = noAppChunk
				? "_next/static/chunks/4383-b31efc3d47a92e29.js"
				: "_next/static/chunks/pages/_app-abc123.js";
			return new Response(
				`<html><head><script src="/${chunk}" defer></script><script src="/_next/static/chunks/main-0.js"></script></head><body></body></html>`
			);
		}
		if (path.endsWith(".js")) {
			if (path.includes("main-0")) return new Response("// nothing here");
			const seg = staleEndpoint ? "stale" : "x";
			// HLTB's real pattern: extra key parts arrive via .concat().
			return new Response(
				`fetch("/api/${seg}/".concat("a").concat("b"), {"headers":{"content-type":"application/json"},"body":JSON.stringify(t),"method":"POST"})`
			);
		}
		if (/^\/api\/(x|s|stale)\/init$/.test(path)) {
			expect(url.searchParams.get("t")).toMatch(/^\d+$/); // cache-buster required
			return Response.json({ token: "tok123", hpKey: "search_zz", hpVal: "vv42" });
		}
		if ((path === "/api/x" || path === "/api/s") && init?.method === "POST") {
			const headers = init.headers as Record<string, string>;
			const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
			searchCalls.push({ path, headers, payload });
			// Enforce the handshake like the real API does.
			if (
				headers["x-auth-token"] !== "tok123" ||
				headers["x-hp-key"] !== "search_zz" ||
				headers["x-hp-val"] !== "vv42" ||
				payload["search_zz"] !== "vv42"
			) {
				return new Response("blocked", { status: 403 });
			}
			const terms = (payload.searchTerms as string[]).join(" ").toLowerCase();
			return Response.json({
				data: RESULTS.filter((game) => game.game_name.toLowerCase().includes(terms)),
			});
		}
		// Anything else (the stale endpoint's POST included) is a hard 404.
		return new Response("not found", { status: 404 });
	});
	vi.stubGlobal("fetch", fetchMock);
	return { fetchMock, searchCalls };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("endpoint discovery + handshake", () => {
	it("discovers the endpoint from the pages/_app chunk and completes the handshake", async () => {
		const { searchCalls } = stubHltb();
		const results = await hltbProvider.search("hollow");
		expect(results.map((r) => r.externalId)).toEqual(["26286", "42069"]);
		expect(searchCalls[0].path).toBe("/api/x");
	});

	it("survives a bundle with no pages/_app chunk by scanning every script", async () => {
		const { searchCalls } = stubHltb({ noAppChunk: true });
		const results = await hltbProvider.search("hollow");
		expect(results).toHaveLength(2);
		expect(searchCalls[0].path).toBe("/api/x");
	});

	it("falls back to the static /api/s when the discovered endpoint is rejected", async () => {
		const { searchCalls } = stubHltb({ staleEndpoint: true });
		const results = await hltbProvider.search("hollow");
		expect(results).toHaveLength(2);
		expect(searchCalls.map((call) => call.path)).toEqual(["/api/s"]);
	});

	it("sends the payload shape the API validates (0s not nulls, difficulty key)", async () => {
		const { searchCalls } = stubHltb();
		await hltbProvider.search("hollow");
		const games = (searchCalls[0].payload as { searchOptions: { games: Record<string, unknown> } })
			.searchOptions.games;
		expect(games.rangeTime).toEqual({ min: 0, max: 0 });
		expect((games.gameplay as Record<string, unknown>).difficulty).toBe("");
	});
});

describe("time lookups", () => {
	it("converts seconds to hours (one decimal) with exact-title preference", async () => {
		stubHltb();
		const times = await fetchHltbTimesByTitle("Hollow Knight");
		expect(times).not.toBeNull();
		expect(times!.hltbMain).toBe(26.5);
		expect(times!.hltbMainExtra).toBe(39.9);
		expect(times!.hltbCompletionist).toBe(63.1);
	});

	it("falls back to the top result when no exact normalized-title match exists", async () => {
		stubHltb();
		const times = await fetchHltbTimesByTitle("hollow");
		expect(times!.hltbMain).toBe(26.5); // first result wins
	});

	it("missing buckets stay undefined instead of 0", async () => {
		stubHltb();
		const times = await fetchHltbTimesById("Hollow Knight", "42069");
		expect(times!.hltbMain).toBe(30);
		expect(times!.hltbMainExtra).toBeUndefined();
		expect(times!.hltbCompletionist).toBeUndefined();
	});

	it("returns null when the pinned id has rotated out of the results", async () => {
		stubHltb();
		expect(await fetchHltbTimesById("Hollow Knight", "999999")).toBeNull();
	});

	it("returns null when nothing matches at all", async () => {
		stubHltb();
		expect(await fetchHltbTimesByTitle("zzz no such game")).toBeNull();
	});
});
