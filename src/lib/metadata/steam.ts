import type { GameMode } from "@/lib/pick";

import type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";

// Steam storefront API (unauthenticated):
//   search:  /api/storesearch/?term=<q>&cc=us&l=en
//   details: /api/appdetails?appids=<id>&cc=us&l=en
//   reviews: /appreviews/<id>?json=1
// No API key needed; results are cached in game_metadata — never refetch per
// page view.

const STORE = "https://store.steampowered.com";
const FETCH_TIMEOUT_MS = 8_000;

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) {
		throw new Error(`Steam request failed: ${res.status} ${url}`);
	}
	return res.json() as Promise<T>;
}

type StoreSearchResponse = {
	items?: { id: number; name: string; tiny_image?: string }[];
};

type AppDetailsData = {
	name?: string;
	short_description?: string;
	header_image?: string;
	genres?: { description: string }[];
	categories?: { id: number; description: string }[];
	release_date?: { coming_soon?: boolean; date?: string };
	metacritic?: { score?: number };
};

type AppDetailsResponse = Record<string, { success: boolean; data?: AppDetailsData }>;

type AppReviewsResponse = {
	query_summary?: { total_positive?: number; total_reviews?: number };
};

// Steam category ids are stable in practice, but fall back to matching the
// description so a regional payload with unexpected ids still derives modes.
const CATEGORY_ID_MODES: Record<number, GameMode> = {
	2: "single-player",
	1: "multi-player",
	9: "co-op",
	38: "online-co-op",
	39: "local-co-op",
	36: "pvp", // Online PvP
	37: "pvp", // Shared/Split Screen PvP
	49: "pvp", // LAN PvP
};

const CATEGORY_DESCRIPTION_MODES: Record<string, GameMode> = {
	"single-player": "single-player",
	"multi-player": "multi-player",
	multiplayer: "multi-player",
	"co-op": "co-op",
	"online co-op": "online-co-op",
	"lan co-op": "online-co-op",
	"shared/split screen co-op": "local-co-op",
	"online pvp": "pvp",
	"lan pvp": "pvp",
	"shared/split screen pvp": "pvp",
	pvp: "pvp",
};

/**
 * Map Steam appdetails categories onto the picker's play-mode vocabulary.
 * `undefined` when categories are missing (unknown), `[]` when present but
 * none matched — the picker treats both as "unknown", never a penalty.
 * Exported so the admin backfill can re-derive from stored raw payloads
 * without refetching.
 */
export function deriveGameModes(
	categories: { id: number; description: string }[] | undefined
): GameMode[] | undefined {
	if (!categories) return undefined;
	const modes = new Set<GameMode>();
	for (const category of categories) {
		const byId = CATEGORY_ID_MODES[category.id];
		if (byId) {
			modes.add(byId);
			continue;
		}
		const byDescription = CATEGORY_DESCRIPTION_MODES[category.description?.toLowerCase() ?? ""];
		if (byDescription) modes.add(byDescription);
	}
	return [...modes];
}

function parseReleaseDate(raw?: string): string | undefined {
	if (!raw) return undefined;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

export const steamProvider: GameMetadataProvider = {
	id: "steam",

	async search(query: string): Promise<GameSearchResult[]> {
		const data = await fetchJson<StoreSearchResponse>(
			`${STORE}/api/storesearch/?term=${encodeURIComponent(query)}&cc=us&l=en`
		);
		return (data.items ?? []).map((item) => ({
			providerId: "steam",
			externalId: String(item.id),
			title: item.name,
			coverUrl: item.tiny_image,
		}));
	},

	async fetchByExternalId(appId: string): Promise<NormalizedGameMetadata> {
		const details = await fetchJson<AppDetailsResponse>(
			`${STORE}/api/appdetails?appids=${appId}&cc=us&l=en`
		);
		const entry = details[appId];
		if (!entry?.success || !entry.data) {
			throw new Error(`Steam appdetails returned no data for app ${appId}`);
		}
		const data = entry.data;

		// Review score is a separate endpoint; its failure shouldn't sink the
		// whole fetch.
		let steamReviewScore: number | undefined;
		let steamReviewCount: number | undefined;
		let reviewsRaw: unknown;
		try {
			const reviews = await fetchJson<AppReviewsResponse>(
				`${STORE}/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`
			);
			const summary = reviews.query_summary;
			if (summary?.total_reviews) {
				steamReviewCount = summary.total_reviews;
				steamReviewScore = Math.round(
					((summary.total_positive ?? 0) / summary.total_reviews) * 100
				);
			}
			reviewsRaw = reviews;
		} catch {
			// degrade silently — score stays unset
		}

		return {
			title: data.name,
			steamAppId: Number(appId),
			headerUrl: data.header_image,
			// Portrait library art; not guaranteed to exist for older titles —
			// the UI falls back to headerUrl.
			coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
			description: data.short_description,
			genres: data.genres?.map((genre) => genre.description),
			gameModes: deriveGameModes(data.categories),
			releaseDate: parseReleaseDate(data.release_date?.date),
			metacriticScore: data.metacritic?.score,
			steamReviewScore,
			steamReviewCount,
			raw: { appdetails: data, appreviews: reviewsRaw },
		};
	},
};
