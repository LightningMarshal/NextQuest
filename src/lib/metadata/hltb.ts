import type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";

// HowLongToBeat has NO official API — every integration scrapes their
// internal search endpoint, and they change it without notice. THIS PROVIDER
// IS EXPECTED TO BREAK PERIODICALLY. The app must always degrade gracefully:
// length_hours is manually editable on every game, and the orchestrator
// swallows failures from this provider.
//
// Strategy (mirrors what the unofficial libraries do, dependency-free):
// 1. Fetch the homepage, locate the current /_next/static/.../_app-*.js chunk
// 2. Regex the chunk for the fetch("/api/<path>/".concat("<key>")...) call to
//    recover the current endpoint + rotating key
// 3. POST the documented search payload to that endpoint
// Any change to their bundle layout breaks step 2 — that's the fragility.

const BASE = "https://howlongtobeat.com";
const FETCH_TIMEOUT_MS = 8_000;
// Plain fetch UAs get bot-blocked; a browser UA is what the unofficial libs use.
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type HltbResult = {
	game_id: number;
	game_name: string;
	game_image?: string;
	release_world?: number;
	profile_steam?: number;
	comp_main?: number; // seconds
	comp_plus?: number;
	comp_100?: number;
};

type HltbSearchResponse = { data?: HltbResult[] };

async function discoverSearchEndpoint(): Promise<string> {
	const homepage = await fetch(BASE, {
		headers: { "User-Agent": USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!homepage.ok) throw new Error(`HLTB homepage: ${homepage.status}`);
	const html = await homepage.text();

	const chunkMatch = html.match(/_next\/static\/chunks\/pages\/_app-[a-zA-Z0-9]+\.js/);
	if (!chunkMatch) throw new Error("HLTB: _app chunk not found (layout changed)");

	const chunkRes = await fetch(`${BASE}/${chunkMatch[0]}`, {
		headers: { "User-Agent": USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!chunkRes.ok) throw new Error(`HLTB chunk: ${chunkRes.status}`);
	const js = await chunkRes.text();

	// fetch("/api/search/".concat("abc").concat("def"), …
	const endpointMatch = js.match(
		/fetch\(\s*["']\/api\/([a-z]+)\/["']((?:\.concat\(\s*["'][^"']*["']\s*\))+)/
	);
	if (!endpointMatch) throw new Error("HLTB: search endpoint pattern not found (API changed)");

	const path = endpointMatch[1];
	const key = [...endpointMatch[2].matchAll(/\.concat\(\s*["']([^"']*)["']\s*\)/g)]
		.map((m) => m[1])
		.join("");
	return `${BASE}/api/${path}/${key}`;
}

async function searchHltb(query: string): Promise<HltbResult[]> {
	const endpoint = await discoverSearchEndpoint();
	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": USER_AGENT,
			Origin: BASE,
			Referer: `${BASE}/`,
		},
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		body: JSON.stringify({
			searchType: "games",
			searchTerms: query.split(/\s+/).filter(Boolean),
			searchPage: 1,
			size: 20,
			searchOptions: {
				games: {
					userId: 0,
					platform: "",
					sortCategory: "popular",
					rangeCategory: "main",
					rangeTime: { min: null, max: null },
					gameplay: { perspective: "", flow: "", genre: "" },
					rangeYear: { min: "", max: "" },
					modifier: "",
				},
				users: { sortCategory: "postcount" },
				lists: { sortCategory: "follows" },
				filter: "",
				sort: 0,
				randomizer: 0,
			},
			useCache: true,
		}),
	});
	if (!res.ok) throw new Error(`HLTB search: ${res.status}`);
	const data = (await res.json()) as HltbSearchResponse;
	return data.data ?? [];
}

function secondsToHours(seconds?: number): number | undefined {
	if (!seconds || seconds <= 0) return undefined;
	return Math.round((seconds / 3600) * 10) / 10;
}

function normalizeTitle(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toMetadata(result: HltbResult): NormalizedGameMetadata {
	return {
		hltbMain: secondsToHours(result.comp_main),
		hltbMainExtra: secondsToHours(result.comp_plus),
		hltbCompletionist: secondsToHours(result.comp_100),
		raw: result,
	};
}

/**
 * Best-effort lookup by title: exact normalized-title match wins, otherwise
 * the top (most popular) result. Returns null when nothing plausible matches.
 */
export async function fetchHltbTimesByTitle(
	title: string
): Promise<NormalizedGameMetadata | null> {
	const results = await searchHltb(title);
	if (results.length === 0) return null;
	const exact = results.find((r) => normalizeTitle(r.game_name) === normalizeTitle(title));
	return toMetadata(exact ?? results[0]);
}

/**
 * Lookup by a game_id obtained from a prior search() call. HLTB has no
 * fetch-by-id endpoint and their search matches NAMES, not ids — so this
 * searches by title and picks the result whose game_id matches. Returns
 * null when the id isn't in the result page (caller falls back to the
 * title-based heuristic above).
 */
export async function fetchHltbTimesById(
	title: string,
	hltbId: string
): Promise<NormalizedGameMetadata | null> {
	const results = await searchHltb(title);
	const match = results.find((result) => String(result.game_id) === hltbId);
	return match ? toMetadata(match) : null;
}

export const hltbProvider: GameMetadataProvider = {
	id: "hltb",

	async search(query: string): Promise<GameSearchResult[]> {
		const results = await searchHltb(query);
		return results.map((result) => ({
			providerId: "hltb",
			externalId: String(result.game_id),
			title: result.game_name,
			releaseYear: result.release_world,
			coverUrl: result.game_image ? `${BASE}/games/${result.game_image}` : undefined,
		}));
	},

	async fetchByExternalId(hltbId: string): Promise<NormalizedGameMetadata> {
		// CAVEAT: HLTB search matches names, so searching the bare numeric id
		// almost never finds the game. Prefer fetchHltbTimesById(title, id)
		// whenever the candidate's title is known — this interface method only
		// exists to satisfy GameMetadataProvider.
		const results = await searchHltb(hltbId);
		const match = results.find((result) => String(result.game_id) === hltbId);
		if (!match) throw new Error(`HLTB: no result for id ${hltbId}`);
		return toMetadata(match);
	},
};
