import type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";

// HowLongToBeat has NO official API — every integration scrapes their
// internal search endpoint, and they change it without notice. THIS PROVIDER
// IS EXPECTED TO BREAK PERIODICALLY. The app must always degrade gracefully:
// length_hours is manually editable on every game, and the orchestrator
// swallows failures from this provider.
//
// TODO(Phase 2): evaluate the `howlongtobeat` npm package under workerd
// (it depends on axios — verify it runs with nodejs_compat, otherwise
// reimplement the search call directly with fetch()).
export const hltbProvider: GameMetadataProvider = {
	id: "hltb",

	async search(_query: string): Promise<GameSearchResult[]> {
		throw new Error("hltbProvider.search not implemented (Phase 2)");
	},

	async fetchByExternalId(_hltbId: string): Promise<NormalizedGameMetadata> {
		throw new Error("hltbProvider.fetchByExternalId not implemented (Phase 2)");
	},
};
