import type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";

// Steam storefront API (unauthenticated):
//   search:  https://store.steampowered.com/api/storesearch/?term=<q>&cc=us&l=en
//   details: https://store.steampowered.com/api/appdetails?appids=<id>&cc=us&l=en
// Returns header art, description, genres, release date, metacritic. Review
// score comes from https://store.steampowered.com/appreviews/<id>?json=1.
// No API key needed; be polite (cache results in game_metadata, don't refetch
// on every page view).
//
// TODO(Phase 2): implement search + fetchByExternalId with fetch(); map the
// appdetails payload into NormalizedGameMetadata and stash the raw response.
export const steamProvider: GameMetadataProvider = {
	id: "steam",

	async search(_query: string): Promise<GameSearchResult[]> {
		throw new Error("steamProvider.search not implemented (Phase 2)");
	},

	async fetchByExternalId(_appId: string): Promise<NormalizedGameMetadata> {
		throw new Error("steamProvider.fetchByExternalId not implemented (Phase 2)");
	},
};
