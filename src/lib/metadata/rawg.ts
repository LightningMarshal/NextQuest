import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";

// RAWG (rawg.io/apidocs) — a large keyed video-game database. Used only as a
// SUPPLEMENT to Steam: it fills art / description / genres / release date /
// Metacritic when Steam is missing or down. Steam stays canonical (Steam
// review % and the category-derived play-modes have no RAWG equivalent).
//
// Auth is a query-string api key (RAWG_API_KEY). Without a key the provider
// is a no-op — the orchestrator checks rawgConfigured() and skips it entirely,
// so a keyless deployment never sees a spurious "rawg" failure. This mirrors
// the optional-secret pattern in bgg.ts / discord.ts.

const API = "https://api.rawg.io/api";
const FETCH_TIMEOUT_MS = 8_000;

function rawgKey(): string | undefined {
	// Request-scoped env (CLAUDE.md #6); the cast mirrors bgg.ts for an
	// optional secret that isn't in the generated env type.
	try {
		const { env } = getCloudflareContext();
		return (env as { RAWG_API_KEY?: string }).RAWG_API_KEY || undefined;
	} catch {
		return undefined;
	}
}

/** Whether a RAWG key is configured — the orchestrator gates on this. */
export function rawgConfigured(): boolean {
	return rawgKey() !== undefined;
}

async function fetchJson<T>(path: string): Promise<T> {
	const key = rawgKey();
	if (!key) throw new Error("RAWG_API_KEY is not configured — RAWG lookups are disabled.");
	const sep = path.includes("?") ? "&" : "?";
	const res = await fetch(`${API}${path}${sep}key=${key}`, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`RAWG request failed: ${res.status} ${path}`);
	return res.json() as Promise<T>;
}

type RawgGame = {
	id: number;
	name?: string;
	released?: string | null; // ISO YYYY-MM-DD
	background_image?: string | null;
	metacritic?: number | null;
	description_raw?: string;
	genres?: { name: string }[];
};

type RawgSearchResponse = { results?: RawgGame[] };

function releaseYear(released: string | null | undefined): number | undefined {
	if (!released) return undefined;
	const year = Number(released.slice(0, 4));
	return Number.isInteger(year) && year > 0 ? year : undefined;
}

function toMetadata(game: RawgGame): NormalizedGameMetadata {
	const art = game.background_image ?? undefined;
	const genres = (game.genres ?? []).map((genre) => genre.name).slice(0, 5);
	return {
		title: game.name,
		headerUrl: art,
		coverUrl: art,
		description:
			typeof game.description_raw === "string" && game.description_raw.trim()
				? game.description_raw.trim().slice(0, 1000)
				: undefined,
		genres: genres.length > 0 ? genres : undefined,
		releaseDate: game.released ?? undefined,
		metacriticScore:
			typeof game.metacritic === "number" && game.metacritic > 0 ? game.metacritic : undefined,
		raw: { rawg: game },
	};
}

export const rawgProvider: GameMetadataProvider = {
	id: "rawg",

	async search(query: string): Promise<GameSearchResult[]> {
		const data = await fetchJson<RawgSearchResponse>(
			`/games?search=${encodeURIComponent(query)}&page_size=8`
		);
		return (data.results ?? [])
			.filter((game): game is RawgGame & { name: string } => Boolean(game.id && game.name))
			.map((game) => ({
				providerId: "rawg",
				externalId: String(game.id),
				title: game.name,
				releaseYear: releaseYear(game.released),
				coverUrl: game.background_image ?? undefined,
			}));
	},

	async fetchByExternalId(externalId: string): Promise<NormalizedGameMetadata> {
		const game = await fetchJson<RawgGame>(`/games/${encodeURIComponent(externalId)}`);
		if (!game?.id) throw new Error(`RAWG game ${externalId} returned no data.`);
		return toMetadata(game);
	},
};

/**
 * Title-search fallback used by the orchestrator to fill gaps Steam left —
 * searches then fetches the top result's detail. Returns null when RAWG is
 * unconfigured or finds nothing; throws only on an actual request error.
 */
export async function fetchRawgByTitle(title: string): Promise<NormalizedGameMetadata | null> {
	if (!rawgConfigured()) return null;
	const data = await fetchJson<RawgSearchResponse>(
		`/games?search=${encodeURIComponent(title)}&page_size=1&search_precise=true`
	);
	const top = data.results?.[0];
	if (!top?.id) return null;
	return rawgProvider.fetchByExternalId(String(top.id));
}
