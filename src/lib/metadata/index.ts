import { fetchHltbTimesById, fetchHltbTimesByTitle, hltbProvider } from "./hltb";
import { steamProvider } from "./steam";
import type { NormalizedGameMetadata } from "./types";

export type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";
export { manualMetadata } from "./manual";
export { steamProvider, hltbProvider };

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
}): Promise<FetchMetadataResult> {
	const metadata: NormalizedGameMetadata = {};
	const sources: string[] = [];
	const failures: string[] = [];
	const raw: Record<string, unknown> = {};

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

	metadata.raw = Object.keys(raw).length > 0 ? raw : undefined;
	return { metadata, sources, failures };
}
