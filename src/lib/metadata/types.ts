// Pluggable game-metadata providers. Each external source (Steam, HLTB, …)
// implements this interface and returns a partial normalized record; the
// orchestrator in ./index.ts merges results. Providers must throw on
// failure — the orchestrator catches per-provider so one broken source
// (looking at you, HLTB) never blocks game creation.

export type GameSearchResult = {
	providerId: string;
	externalId: string;
	title: string;
	releaseYear?: number;
	coverUrl?: string;
};

export type NormalizedGameMetadata = {
	title?: string;
	steamAppId?: number;
	coverUrl?: string;
	headerUrl?: string;
	description?: string;
	genres?: string[];
	releaseDate?: string; // ISO date
	steamReviewScore?: number; // % positive
	steamReviewCount?: number;
	metacriticScore?: number;
	hltbMain?: number; // hours
	hltbMainExtra?: number;
	hltbCompletionist?: number;
	// BGG XML API2 (boardgamegeek + rpggeek). Rating is rescaled 0–100 so it
	// slots into the quality signals next to Steam %/Metacritic; weight is
	// BGG's 1–5 community complexity (board games only). Playtime/players
	// prefill tabletop_details at propose time only — refresh never writes
	// them (the tabletop analog of "refresh never touches games.*").
	bggId?: number;
	bggRating?: number; // 0–100
	bggWeight?: number; // 1–5
	playtimeMinutes?: number;
	minPlayers?: number;
	maxPlayers?: number;
	/** RPG item's parent game/system name, e.g. "Delta Green". */
	system?: string;
	/** Play-mode vocabulary from src/lib/pick.ts, derived from Steam categories. */
	gameModes?: string[];
	/** Raw provider payload, persisted to game_metadata.raw for re-derivation. */
	raw?: unknown;
};

export interface GameMetadataProvider {
	/** Stable identifier, e.g. "steam" | "hltb" | "manual". */
	id: string;
	search(query: string): Promise<GameSearchResult[]>;
	fetchByExternalId(externalId: string): Promise<NormalizedGameMetadata>;
}
