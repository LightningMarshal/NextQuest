// Read helpers for the library (server-only, NOT "use server").

import { asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb, schema } from "@/db";

/** Games people are keen on, most-wanted first — the home page's "post one" nudge. */
export async function getKeenGames(limit: number): Promise<{ id: string; title: string; keen: number }[]> {
	const keen = sql<number>`count(${schema.gameInterest.userId})::int`;
	return getDb()
		.select({ id: schema.games.id, title: schema.games.title, keen })
		.from(schema.gameInterest)
		.innerJoin(schema.games, eq(schema.gameInterest.gameId, schema.games.id))
		.where(inArray(schema.games.status, ["proposed", "backlog", "playing"]))
		.groupBy(schema.games.id, schema.games.title)
		.orderBy(desc(keen), schema.games.title)
		.limit(limit);
}

export type LibraryGame = {
	id: string;
	title: string;
	gameType: "video" | "ttrpg" | "boardgame";
	status: (typeof schema.gameStatus.enumValues)[number];
	pitch: string | null;
	lengthHours: string | null;
	difficulty: number | null;
	createdAt: Date;
	proposerName: string | null;
	art: string | null;
	description: string | null;
	genres: string[] | null;
	gameModes: string[] | null;
	releaseDate: string | null;
	steamReviewScore: number | null;
	steamReviewCount: number | null;
	metacriticScore: number | null;
	hltbMain: string | null;
	hltbMainExtra: string | null;
	hltbCompletionist: string | null;
	bggRating: number | null;
	tabletop: {
		system: string | null;
		format: "virtual" | "in_person" | "hybrid" | null;
		platform: string | null;
		minPlayers: number | null;
		maxPlayers: number | null;
		lengthBand: "one_shot" | "arc" | "mini_campaign" | "campaign" | null;
		playtimeMinutes: number | null;
		gmName: string | null;
	} | null;
	keen: { userId: string; name: string; image: string | null }[];
	tags: { id: string; name: string }[];
	sessionsHeld: number;
	nextSession: { id: string; scheduledAt: Date } | null;
	memberRatings: number[];
};

/**
 * Everything the library page shows, in five parallel queries. Selects
 * explicit columns — never game_metadata.raw (provider payloads that used to
 * make /backlog ship ~50 KB per game).
 */
export async function getLibrary(): Promise<LibraryGame[]> {
	const db = getDb();
	const gm = alias(schema.user, "gm_user");
	const [rows, keenRows, tagRows, eventRows, ratingRows] = await Promise.all([
		db
			.select({
				id: schema.games.id,
				title: schema.games.title,
				gameType: schema.games.gameType,
				status: schema.games.status,
				pitch: schema.games.pitch,
				lengthHours: schema.games.lengthHours,
				difficulty: schema.games.difficulty,
				createdAt: schema.games.createdAt,
				proposerName: schema.user.name,
				headerUrl: schema.gameMetadata.headerUrl,
				coverUrl: schema.gameMetadata.coverUrl,
				description: schema.gameMetadata.description,
				genres: schema.gameMetadata.genres,
				gameModes: schema.gameMetadata.gameModes,
				releaseDate: schema.gameMetadata.releaseDate,
				steamReviewScore: schema.gameMetadata.steamReviewScore,
				steamReviewCount: schema.gameMetadata.steamReviewCount,
				metacriticScore: schema.gameMetadata.metacriticScore,
				hltbMain: schema.gameMetadata.hltbMain,
				hltbMainExtra: schema.gameMetadata.hltbMainExtra,
				hltbCompletionist: schema.gameMetadata.hltbCompletionist,
				bggRating: schema.gameMetadata.bggRating,
				ttGameId: schema.tabletopDetails.gameId,
				system: schema.tabletopDetails.system,
				format: schema.tabletopDetails.format,
				platform: schema.tabletopDetails.platform,
				minPlayers: schema.tabletopDetails.minPlayers,
				maxPlayers: schema.tabletopDetails.maxPlayers,
				lengthBand: schema.tabletopDetails.lengthBand,
				playtimeMinutes: schema.tabletopDetails.playtimeMinutes,
				gmName: gm.name,
			})
			.from(schema.games)
			.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
			.leftJoin(schema.tabletopDetails, eq(schema.games.id, schema.tabletopDetails.gameId))
			.leftJoin(gm, eq(schema.tabletopDetails.gmUserId, gm.id))
			.leftJoin(schema.user, eq(schema.games.proposedBy, schema.user.id))
			.orderBy(desc(schema.games.createdAt)),
		db
			.select({
				gameId: schema.gameInterest.gameId,
				userId: schema.gameInterest.userId,
				name: schema.user.name,
				image: schema.user.image,
			})
			.from(schema.gameInterest)
			.innerJoin(schema.user, eq(schema.gameInterest.userId, schema.user.id))
			.orderBy(asc(schema.gameInterest.createdAt)),
		db
			.select({ gameId: schema.gameTags.gameId, id: schema.tags.id, name: schema.tags.name })
			.from(schema.gameTags)
			.innerJoin(schema.tags, eq(schema.gameTags.tagId, schema.tags.id))
			.orderBy(asc(schema.tags.name)),
		db
			.select({
				id: schema.events.id,
				gameId: schema.events.gameId,
				status: schema.events.status,
				scheduledAt: schema.events.scheduledAt,
			})
			.from(schema.events)
			.where(isNotNull(schema.events.gameId)),
		db.select({ gameId: schema.gameRatings.gameId, rating: schema.gameRatings.rating }).from(schema.gameRatings),
	]);

	const group = <T extends { gameId: string | null }>(list: T[]) => {
		const map = new Map<string, T[]>();
		for (const item of list) {
			if (!item.gameId) continue;
			map.set(item.gameId, [...(map.get(item.gameId) ?? []), item]);
		}
		return map;
	};
	const keenBy = group(keenRows);
	const tagsBy = group(tagRows);
	const eventsBy = group(eventRows);
	const ratingsBy = group(ratingRows);
	const now = Date.now();

	return rows.map(({ headerUrl, coverUrl, ttGameId, system, format, platform, minPlayers, maxPlayers, lengthBand, playtimeMinutes, gmName, ...row }) => {
		const events = eventsBy.get(row.id) ?? [];
		const upcoming = events
			.filter((event) => event.status === "scheduled" && event.scheduledAt.getTime() > now)
			.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
		return {
			...row,
			art: headerUrl ?? coverUrl,
			tabletop: ttGameId
				? { system, format, platform, minPlayers, maxPlayers, lengthBand, playtimeMinutes, gmName }
				: null,
			keen: (keenBy.get(row.id) ?? []).map(({ userId, name, image }) => ({ userId, name, image })),
			tags: (tagsBy.get(row.id) ?? []).map(({ id, name }) => ({ id, name })),
			sessionsHeld: events.filter((event) => event.status === "completed").length,
			nextSession: upcoming[0] ? { id: upcoming[0].id, scheduledAt: upcoming[0].scheduledAt } : null,
			memberRatings: (ratingsBy.get(row.id) ?? []).map((r) => r.rating),
		};
	});
}
