// The full JSON snapshot of the group's data (server-only, NOT "use
// server"): shared by the admin download (api/export) and the scheduled
// backup (cron/backup.ts), so the two can never drift apart.
//
// ANONYMITY INVARIANT: votes leave ONLY as {gameId, totalWeight} aggregates.
// No per-member ballot ever crosses this boundary.
//
// Deliberately absent: sessions/accounts/verification (credentials), Discord
// webhook URLs (credentials), invite token hashes, and provider `raw`
// payloads (refetchable bulk).

import { asc, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

export async function buildSnapshot() {
	const db = getDb();

	const [
		settings,
		members,
		games,
		// metadata WITHOUT `raw`: provider payloads are refetchable bulk, not
		// group history, and they dwarf everything else in the file.
		metadata,
		tabletop,
		history,
		tallies,
		milestones,
		tags,
		gameTags,
		events,
		attendance,
		polls,
		options,
		responses,
		marks,
		ratings,
		comments,
		interest,
	] = await Promise.all([
		db.select().from(schema.appSettings),
		db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				email: schema.user.email,
				role: schema.user.role,
				status: schema.user.status,
				createdAt: schema.user.createdAt,
			})
			.from(schema.user)
			.orderBy(asc(schema.user.createdAt)),
		db.select().from(schema.games).orderBy(asc(schema.games.createdAt)),
		db
			.select({
				gameId: schema.gameMetadata.gameId,
				source: schema.gameMetadata.source,
				coverUrl: schema.gameMetadata.coverUrl,
				headerUrl: schema.gameMetadata.headerUrl,
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
				bggWeight: schema.gameMetadata.bggWeight,
				fetchedAt: schema.gameMetadata.fetchedAt,
			})
			.from(schema.gameMetadata),
		db.select().from(schema.tabletopDetails),
		db.select().from(schema.gameStatusHistory).orderBy(asc(schema.gameStatusHistory.changedAt)),
		db
			.select({
				gameId: schema.votes.gameId,
				totalWeight: sql<number>`sum(${schema.votes.weight})::int`,
			})
			.from(schema.votes)
			.groupBy(schema.votes.gameId),
		db.select().from(schema.gameVoteMilestones),
		db.select().from(schema.tags).orderBy(asc(schema.tags.name)),
		db.select().from(schema.gameTags),
		db.select().from(schema.events).orderBy(asc(schema.events.scheduledAt)),
		db.select().from(schema.eventAttendance),
		db.select().from(schema.availabilityPolls).orderBy(asc(schema.availabilityPolls.createdAt)),
		db.select().from(schema.availabilityOptions),
		db.select().from(schema.availabilityResponses),
		db.select().from(schema.availabilityMarks),
		db.select().from(schema.gameRatings),
		db.select().from(schema.gameComments).orderBy(asc(schema.gameComments.createdAt)),
		// "I'd play this" is public within the group (unlike votes).
		db.select().from(schema.gameInterest).orderBy(asc(schema.gameInterest.createdAt)),
	]);

	return {
		app: "NextQuest",
		exportVersion: 3,
		exportedAt: new Date().toISOString(),
		settings: settings[0] ?? null,
		members,
		games,
		gameMetadata: metadata,
		tabletopDetails: tabletop,
		statusHistory: history,
		// Aggregates only — the anonymity invariant applies to exports too.
		voteTallies: tallies,
		voteMilestones: milestones,
		tags,
		gameTags,
		events,
		eventAttendance: attendance,
		availabilityPolls: polls,
		availabilityOptions: options,
		availabilityResponses: responses,
		availabilityMarks: marks,
		gameRatings: ratings,
		gameComments: comments,
		gameInterest: interest,
	};
}
