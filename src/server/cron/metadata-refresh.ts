// Cron task (not a server action — invoked via the secret-gated /api/cron
// route, which runs it inside a normal request context where getDb() works).
// Re-fetches stale provider metadata so Steam review scores and HLTB times
// don't fossilize at proposal time.

import { and, eq, inArray, isNotNull, lt, or, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { fetchGameMetadata } from "@/lib/metadata";
import { buildMetadataUpdates } from "@/server/metadata-write";

const STALE_AFTER_DAYS = 7;
// Small daily batch: politeness to Steam, and friend-group scale means the
// whole library still cycles within weeks.
const BATCH_SIZE = 5;

export async function refreshStaleMetadata(): Promise<{
	candidates: number;
	refreshed: number;
	failed: number;
}> {
	const db = getDb();
	const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);

	// fetchedAt IS NULL means manual-only metadata — never touched here, so a
	// hand-entered game can't be clobbered by a provider lookup (CLAUDE.md #5
	// spirit: providers only ever add, never block or overwrite manual work).
	const candidates = await db
		.select({
			gameId: schema.games.id,
			title: schema.games.title,
			steamAppId: schema.games.steamAppId,
			source: schema.gameMetadata.source,
			raw: schema.gameMetadata.raw,
		})
		.from(schema.games)
		.innerJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
		.where(
			and(
				// Tabletop rows are manual-only (fetchedAt null) and excluded by
				// the predicate below anyway — the explicit filter is belt-and-
				// braces until a tabletop provider exists.
				eq(schema.games.gameType, "video"),
				inArray(schema.games.status, ["proposed", "backlog", "playing"]),
				isNotNull(schema.gameMetadata.fetchedAt),
				lt(schema.gameMetadata.fetchedAt, cutoff),
				or(
					isNull(schema.gameMetadata.lastRefreshAttemptAt),
					lt(schema.gameMetadata.lastRefreshAttemptAt, cutoff)
				)
			)
		)
		.orderBy(sql`${schema.gameMetadata.fetchedAt} asc`)
		.limit(BATCH_SIZE);

	let refreshed = 0;
	let failed = 0;

	for (const candidate of candidates) {
		await db
			.update(schema.gameMetadata)
			.set({ lastRefreshAttemptAt: new Date() })
			.where(eq(schema.gameMetadata.gameId, candidate.gameId));

		const result = await fetchGameMetadata({
			title: candidate.title,
			steamAppId: candidate.steamAppId ?? undefined,
		});
		if (result.sources.length === 0) {
			// All providers failed — skip silently and retry after the cutoff.
			failed += 1;
			continue;
		}

		await db
			.update(schema.gameMetadata)
			.set(buildMetadataUpdates(candidate, result))
			.where(eq(schema.gameMetadata.gameId, candidate.gameId));
		refreshed += 1;
	}

	return { candidates: candidates.length, refreshed, failed };
}
