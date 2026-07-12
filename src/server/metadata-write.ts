// Shared write-side helpers for provider metadata refreshes. Plain server
// module (NOT "use server") — used by the cron task and the per-game
// refresh action; exposing these directly as POST endpoints would skip
// their callers' gates.

import { schema } from "@/db";
import type { FetchMetadataResult } from "@/lib/metadata";

type MetadataSource = (typeof schema.metadataSource.enumValues)[number];

export function mergedSource(current: MetadataSource, fetched: string[]): MetadataSource {
	const contributors = new Set<string>(fetched);
	// Any prior provider source counts as a contributor; manual doesn't (a
	// provider fetch on a manual row upgrades it to that provider's source).
	if (current === "mixed") return "mixed";
	if (current !== "manual") contributors.add(current);
	if (contributors.size > 1) return "mixed";
	return (contributors.values().next().value as MetadataSource) ?? current;
}

/**
 * Build the game_metadata update for a fetch result. Only fields the fetch
 * actually returned are overwritten: a partial provider failure (e.g. HLTB
 * down) must not null out existing columns. games.* (lengthHours/difficulty/
 * points) is never touched — invariant #2. Caller must ensure
 * result.sources is non-empty before applying.
 */
export function buildMetadataUpdates(
	current: { source: MetadataSource; raw: unknown },
	result: FetchMetadataResult
): Partial<typeof schema.gameMetadata.$inferInsert> {
	const { metadata, sources } = result;
	const updates: Partial<typeof schema.gameMetadata.$inferInsert> = {
		source: mergedSource(current.source, sources),
		fetchedAt: new Date(),
	};
	if (metadata.coverUrl !== undefined) updates.coverUrl = metadata.coverUrl;
	if (metadata.headerUrl !== undefined) updates.headerUrl = metadata.headerUrl;
	if (metadata.description !== undefined) updates.description = metadata.description;
	if (metadata.genres !== undefined) updates.genres = metadata.genres;
	if (metadata.gameModes !== undefined)
		updates.gameModes = metadata.gameModes as (typeof schema.gameMetadata.$inferInsert)["gameModes"];
	if (metadata.releaseDate !== undefined) updates.releaseDate = metadata.releaseDate;
	if (metadata.steamReviewScore !== undefined)
		updates.steamReviewScore = metadata.steamReviewScore;
	if (metadata.steamReviewCount !== undefined)
		updates.steamReviewCount = metadata.steamReviewCount;
	if (metadata.metacriticScore !== undefined)
		updates.metacriticScore = metadata.metacriticScore;
	if (metadata.hltbMain !== undefined) updates.hltbMain = String(metadata.hltbMain);
	if (metadata.hltbMainExtra !== undefined)
		updates.hltbMainExtra = String(metadata.hltbMainExtra);
	if (metadata.hltbCompletionist !== undefined)
		updates.hltbCompletionist = String(metadata.hltbCompletionist);
	if (metadata.bggRating !== undefined) updates.bggRating = metadata.bggRating;
	if (metadata.bggWeight !== undefined) updates.bggWeight = String(metadata.bggWeight);
	// Deliberately NOT written here: playtimeMinutes/minPlayers/maxPlayers/
	// system live in tabletop_details and prefill at propose time only —
	// a refresh never rewrites the group's curated structured fields (the
	// tabletop analog of "refresh never touches games.*").
	if (metadata.raw !== undefined) {
		const oldRaw =
			current.raw && typeof current.raw === "object"
				? (current.raw as Record<string, unknown>)
				: {};
		updates.raw = { ...oldRaw, ...(metadata.raw as Record<string, unknown>) };
	}
	return updates;
}
