import { bggProvider } from "./bgg";
import { fetchHltbTimesById, fetchHltbTimesByTitle, hltbProvider } from "./hltb";
import { fetchRawgByTitle, rawgConfigured, rawgProvider } from "./rawg";
import { steamProvider } from "./steam";
import type { NormalizedGameMetadata } from "./types";

export type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";
export { manualMetadata } from "./manual";
export { steamProvider, hltbProvider, bggProvider, rawgProvider };

export type FetchMetadataResult = {
	metadata: NormalizedGameMetadata;
	/** Provider ids that contributed data, e.g. ["steam", "hltb"]. */
	sources: string[];
	/** Provider ids that errored — surfaced in the UI as "fill in manually". */
	failures: string[];
};

// Merge order: Steam first (art, description, genres), HLTB layered on top
// for the time-to-beat fields only. Per-provider try/catch is the graceful-
// degradation guarantee: any provider failing just means fewer prefilled
// fields, never a blocked proposal.
export async function fetchGameMetadata(params: {
	title: string;
	steamAppId?: number;
	/** From a prior hltbProvider.search() pick — pins the exact HLTB entry. */
	hltbId?: string;
	/** "<type>:<id>" from a bggProvider.search() pick — tabletop games only. */
	bggId?: string;
	/** From a prior rawgProvider.search() pick — pins the exact RAWG entry. */
	rawgId?: number;
}): Promise<FetchMetadataResult> {
	const metadata: NormalizedGameMetadata = {};
	const sources: string[] = [];
	const failures: string[] = [];
	const raw: Record<string, unknown> = {};

	// Tabletop path: BGG is the only provider — Steam/HLTB would title-match
	// the wrong medium entirely.
	if (params.bggId) {
		try {
			const bgg = await bggProvider.fetchByExternalId(params.bggId);
			raw.bgg = (bgg.raw as Record<string, unknown> | undefined)?.bgg;
			Object.assign(metadata, bgg, { raw: undefined });
			sources.push(bggProvider.id);
		} catch {
			failures.push(bggProvider.id);
		}
		metadata.raw = Object.keys(raw).length > 0 ? raw : undefined;
		return { metadata, sources, failures };
	}

	if (params.steamAppId) {
		try {
			const steam = await steamProvider.fetchByExternalId(String(params.steamAppId));
			raw.steam = steam.raw;
			Object.assign(metadata, steam, { raw: undefined });
			sources.push(steamProvider.id);
		} catch {
			failures.push(steamProvider.id);
		}
	}

	// Prefer Steam's canonical title for the HLTB lookup when we have it.
	const hltbQuery = metadata.title ?? params.title;
	try {
		// A selected candidate id pins the exact entry; fall back to the title
		// heuristic when the id has rotated out of the search page.
		const hltb =
			(params.hltbId ? await fetchHltbTimesById(hltbQuery, params.hltbId) : null) ??
			(await fetchHltbTimesByTitle(hltbQuery));
		if (hltb) {
			metadata.hltbMain = hltb.hltbMain;
			metadata.hltbMainExtra = hltb.hltbMainExtra;
			metadata.hltbCompletionist = hltb.hltbCompletionist;
			raw.hltb = hltb.raw;
			sources.push(hltbProvider.id);
		}
	} catch {
		failures.push(hltbProvider.id);
	}

	// RAWG supplement: fills art / description / genres / release date /
	// Metacritic that Steam left blank (Steam stays canonical). Only runs when
	// a key is configured, so a keyless deployment never sees a rawg failure.
	// A picked candidate (rawgId) always resolves; otherwise it's a title
	// fallback, skipped when Steam already filled the visible fields.
	const rawgFillNeeded =
		!metadata.headerUrl || !metadata.description || !(metadata.genres && metadata.genres.length > 0);
	if (rawgConfigured() && (params.rawgId !== undefined || rawgFillNeeded)) {
		try {
			const rawg = params.rawgId
				? await rawgProvider.fetchByExternalId(String(params.rawgId))
				: await fetchRawgByTitle(metadata.title ?? params.title);
			if (rawg) {
				metadata.title = metadata.title ?? rawg.title;
				metadata.headerUrl = metadata.headerUrl ?? rawg.headerUrl;
				metadata.coverUrl = metadata.coverUrl ?? rawg.coverUrl;
				metadata.description = metadata.description ?? rawg.description;
				if (!(metadata.genres && metadata.genres.length > 0)) metadata.genres = rawg.genres;
				metadata.releaseDate = metadata.releaseDate ?? rawg.releaseDate;
				metadata.metacriticScore = metadata.metacriticScore ?? rawg.metacriticScore;
				raw.rawg = (rawg.raw as Record<string, unknown> | undefined)?.rawg;
				sources.push(rawgProvider.id);
			}
		} catch {
			failures.push(rawgProvider.id);
		}
	}

	metadata.raw = Object.keys(raw).length > 0 ? raw : undefined;
	return { metadata, sources, failures };
}
