import type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";

// HowLongToBeat has NO official API — every integration scrapes their
// internal search endpoint, and they change it without notice. THIS PROVIDER
// IS EXPECTED TO BREAK PERIODICALLY. The app must always degrade gracefully:
// length_hours is manually editable on every game, and the orchestrator
// swallows failures from this provider.
//
// Strategy (dependency-free; ported from the maintained reference
// ScrappyCocco/HowLongToBeat-PythonAPI, which tracks HLTB's current scheme):
// 1. Fetch the homepage, locate the current /_next/static/.../_app-*.js chunk.
// 2. Regex the chunk for the POST `fetch("/api/<path>…", {…method:"POST"…})`
//    call and take the endpoint's first path segment → /api/<seg>.
// 3. GET /api/<seg>/init to obtain an auth handshake — a `token` plus a
//    key/val pair (HLTB added this to lock out naive scrapers).
// 4. POST the search payload to /api/<seg>, sending the handshake as the
//    x-auth-token / x-hp-key / x-hp-val headers and injecting the key/val
//    into the payload.
// Any change to their bundle/endpoint/handshake breaks steps 2–3 — that's the
// fragility, and every failure degrades to manual entry.

const BASE = "https://howlongtobeat.com";
const FETCH_TIMEOUT_MS = 8_000;
// Plain fetch UAs get bot-blocked; a browser UA is what the unofficial libs use.
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type HltbAuth = { token?: string; hpKey?: string; hpVal?: string };

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

/** The `/api/<seg>` search path, discovered from the current app bundle. */
async function discoverSearchEndpoint(): Promise<string> {
	const homepage = await fetch(BASE, {
		headers: { "User-Agent": USER_AGENT },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!homepage.ok) throw new Error(`HLTB homepage: ${homepage.status}`);
	const html = await homepage.text();

	// Hashes have grown to include - and . over time; scan all _app chunks.
	const chunkPaths = [...html.matchAll(/_next\/static\/chunks\/pages\/_app-[\w.-]+\.js/g)].map(
		(m) => m[0]
	);
	if (chunkPaths.length === 0) throw new Error("HLTB: _app chunk not found (layout changed)");

	for (const chunkPath of chunkPaths) {
		const chunkRes = await fetch(`${BASE}/${chunkPath}`, {
			headers: { "User-Agent": USER_AGENT },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!chunkRes.ok) continue;
		const js = await chunkRes.text();

		// Current scheme: a POST fetch to the search endpoint, e.g.
		// fetch("/api/s/...", { method: "POST", … }). Fall back to any /api
		// fetch if the strict form (with the method clause) doesn't match.
		const seg =
			js.match(
				/fetch\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method\s*:\s*["']POST["']/is
			)?.[1] ?? js.match(/fetch\(\s*["']\/api\/([a-z0-9_/]+)/i)?.[1];
		if (seg) return `/api/${seg.split("/")[0]}`;
	}
	throw new Error("HLTB: search endpoint pattern not found (API changed)");
}

/**
 * HLTB's anti-scraper handshake: GET /api/<seg>/init returns a token plus a
 * key/val pair (field names vary, so scan for them). Best-effort — a missing
 * or reshaped response just yields undefined fields, and the search then
 * degrades like any other failure.
 */
async function fetchAuthToken(apiPath: string): Promise<HltbAuth> {
	const res = await fetch(`${BASE}${apiPath}/init`, {
		headers: { "User-Agent": USER_AGENT, Accept: "*/*", Referer: `${BASE}/` },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) return {};
	const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (!json) return {};

	const auth: HltbAuth = {};
	if (typeof json.token === "string") auth.token = json.token;
	for (const [name, value] of Object.entries(json)) {
		if (typeof value !== "string" || name === "token") continue;
		const lower = name.toLowerCase();
		if (auth.hpKey === undefined && /key/.test(lower)) auth.hpKey = value;
		else if (auth.hpVal === undefined && /val/.test(lower)) auth.hpVal = value;
	}
	return auth;
}

async function searchHltb(query: string): Promise<HltbResult[]> {
	const apiPath = await discoverSearchEndpoint();
	const auth = await fetchAuthToken(apiPath);

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "*/*",
		"User-Agent": USER_AGENT,
		Origin: BASE,
		Referer: `${BASE}/`,
	};
	if (auth.token) headers["x-auth-token"] = auth.token;
	if (auth.hpKey) headers["x-hp-key"] = auth.hpKey;
	if (auth.hpVal) headers["x-hp-val"] = auth.hpVal;

	const payload: Record<string, unknown> = {
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
	};
	// The handshake's key/val also ride in the body under the key's own value.
	if (auth.hpKey && auth.hpVal) payload[auth.hpKey] = auth.hpVal;

	const res = await fetch(`${BASE}${apiPath}`, {
		method: "POST",
		headers,
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		body: JSON.stringify(payload),
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
