import { hltbProvider } from "./hltb";
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
	steamAppId?: string;
	hltbId?: string;
}): Promise<FetchMetadataResult> {
	const metadata: NormalizedGameMetadata = {};
	const sources: string[] = [];
	const failures: string[] = [];

	if (params.steamAppId) {
		try {
			Object.assign(metadata, await steamProvider.fetchByExternalId(params.steamAppId));
			sources.push(steamProvider.id);
		} catch {
			failures.push(steamProvider.id);
		}
	}

	if (params.hltbId) {
		try {
			const hltb = await hltbProvider.fetchByExternalId(params.hltbId);
			metadata.hltbMain = hltb.hltbMain;
			metadata.hltbMainExtra = hltb.hltbMainExtra;
			metadata.hltbCompletionist = hltb.hltbCompletionist;
			sources.push(hltbProvider.id);
		} catch {
			failures.push(hltbProvider.id);
		}
	}

	return { metadata, sources, failures };
}
