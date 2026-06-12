// Cron task (not a server action — invoked via the secret-gated /api/cron
// route, which runs it inside a normal request context where getDb() works).
// Re-fetches stale provider metadata so Steam review scores and HLTB times
// don't fossilize at proposal time.

import { and, eq, inArray, isNotNull, lt, or, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { fetchGameMetadata } from "@/lib/metadata";

const STALE_AFTER_DAYS = 7;
// Small daily batch: politeness to Steam, and friend-group scale means the
// whole library still cycles within weeks.
const BATCH_SIZE = 5;

type MetadataSource = (typeof schema.metadataSource.enumValues)[number];

function mergedSource(current: MetadataSource, fetched: string[]): MetadataSource {
	const contributors = new Set<string>(fetched);
	if (current === "steam" || current === "hltb" || current === "mixed") {
		if (current === "mixed") return "mixed";
		contributors.add(current);
	}
	if (contributors.size > 1) return "mixed";
	return (contributors.values().next().value as MetadataSource) ?? current;
}

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

		const { metadata, sources } = await fetchGameMetadata({
			title: candidate.title,
			steamAppId: candidate.steamAppId ?? undefined,
		});
		if (sources.length === 0) {
			// All providers failed — skip silently and retry after the cutoff.
			failed += 1;
			continue;
		}

		// Only overwrite fields the fetch actually returned: a partial provider
		// failure (e.g. HLTB down) must not null out existing columns. games.*
		// (lengthHours/difficulty/points) is never touched — invariant #2.
		const updates: Partial<typeof schema.gameMetadata.$inferInsert> = {
			source: mergedSource(candidate.source, sources),
			fetchedAt: new Date(),
		};
		if (metadata.coverUrl !== undefined) updates.coverUrl = metadata.coverUrl;
		if (metadata.headerUrl !== undefined) updates.headerUrl = metadata.headerUrl;
		if (metadata.description !== undefined) updates.description = metadata.description;
		if (metadata.genres !== undefined) updates.genres = metadata.genres;
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
		if (metadata.raw !== undefined) {
			const oldRaw =
				candidate.raw && typeof candidate.raw === "object"
					? (candidate.raw as Record<string, unknown>)
					: {};
			updates.raw = { ...oldRaw, ...(metadata.raw as Record<string, unknown>) };
		}

		await db
			.update(schema.gameMetadata)
			.set(updates)
			.where(eq(schema.gameMetadata.gameId, candidate.gameId));
		refreshed += 1;
	}

	return { candidates: candidates.length, refreshed, failed };
}
