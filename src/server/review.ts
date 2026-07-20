// Read-side assembly for /review — the "year in review" artifact (Phase 20).
// Everything here is already stored: completions from game_status_history
// (the append-only record, same source as burn rate), sessions from
// completed events, presence from attendance. Vote data appears nowhere.

import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { averageRating, pickGoty } from "@/lib/ratings";

export type YearInReview = {
	year: number;
	/** Years that actually have completions or sessions — feeds the picker. */
	availableYears: number[];
	finished: {
		id: string;
		title: string;
		gameType: "video" | "ttrpg" | "boardgame";
		effort: number | null;
		art: string | null;
		completedAt: Date;
	}[];
	totals: {
		effortBurned: number;
		gamesFinished: number;
		gamesStarted: number;
		gamesProposed: number;
		sessionsHeld: number;
		/** Sum of recorded session durations, in hours (rounded). */
		hoursAtTheTable: number;
		averageRating: number | null;
	};
	bestSession: {
		title: string;
		scheduledAt: Date;
		gameTitle: string | null;
		howItWent: number;
		recap: string | null;
	} | null;
	/** Sessions per game, most-played first (completed events only). */
	mostPlayed: { title: string; sessions: number }[];
	/** Attendance leaderboard for the year (public data, like RSVPs). */
	presence: { id: string; name: string; attended: number }[];
	// Phase 21: group game of the year — best average MEMBER rating among the
	// year's finished games (min-raters floor via pickGoty). Null until
	// enough people have rated something.
	goty: {
		id: string;
		title: string;
		art: string | null;
		average: number;
		spread: { name: string; rating: number; note: string | null }[];
	} | null;
};

export async function getYearInReview(year: number): Promise<YearInReview> {
	const db = getDb();
	const start = new Date(Date.UTC(year, 0, 1));
	const end = new Date(Date.UTC(year + 1, 0, 1));
	const effectivePoints = sql<number | null>`coalesce(${schema.games.pointsOverride}, ${schema.games.points})`;

	const [finishedRows, startedRows, proposedRows, sessionRows, presence, yearRows] =
		await Promise.all([
			// Earliest completion transition per game inside the year; only
			// currently-completed games count (mirrors dashboard burn rate).
			db
				.select({
					id: schema.games.id,
					title: schema.games.title,
					gameType: schema.games.gameType,
					effort: effectivePoints,
					headerUrl: schema.gameMetadata.headerUrl,
					coverUrl: schema.gameMetadata.coverUrl,
					completedAt: sql<string>`min(${schema.gameStatusHistory.changedAt})`,
				})
				.from(schema.gameStatusHistory)
				.innerJoin(schema.games, eq(schema.gameStatusHistory.gameId, schema.games.id))
				.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
				.where(
					and(
						eq(schema.gameStatusHistory.toStatus, "completed"),
						eq(schema.games.status, "completed"),
						gte(schema.gameStatusHistory.changedAt, start),
						lt(schema.gameStatusHistory.changedAt, end)
					)
				)
				.groupBy(
					schema.games.id,
					schema.games.title,
					schema.games.gameType,
					schema.games.points,
					schema.games.pointsOverride,
					schema.gameMetadata.headerUrl,
					schema.gameMetadata.coverUrl
				),
			db
				.select({ count: sql<number>`count(distinct ${schema.gameStatusHistory.gameId})::int` })
				.from(schema.gameStatusHistory)
				.where(
					and(
						eq(schema.gameStatusHistory.toStatus, "playing"),
						gte(schema.gameStatusHistory.changedAt, start),
						lt(schema.gameStatusHistory.changedAt, end)
					)
				),
			db
				.select({ count: sql<number>`count(*)::int` })
				.from(schema.games)
				.where(and(gte(schema.games.createdAt, start), lt(schema.games.createdAt, end))),
			db
				.select({
					title: schema.events.title,
					scheduledAt: schema.events.scheduledAt,
					durationMinutes: schema.events.durationMinutes,
					howItWent: schema.events.howItWent,
					recap: schema.events.recap,
					gameTitle: schema.games.title,
				})
				.from(schema.events)
				.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
				.where(
					and(
						eq(schema.events.status, "completed"),
						gte(schema.events.scheduledAt, start),
						lt(schema.events.scheduledAt, end)
					)
				)
				.orderBy(desc(schema.events.scheduledAt)),
			db
				.select({
					id: schema.user.id,
					name: schema.user.name,
					attended: sql<number>`count(*)::int`,
				})
				.from(schema.eventAttendance)
				.innerJoin(schema.events, eq(schema.eventAttendance.eventId, schema.events.id))
				.innerJoin(schema.user, eq(schema.eventAttendance.userId, schema.user.id))
				.where(
					and(
						eq(schema.eventAttendance.attended, true),
						eq(schema.events.status, "completed"),
						gte(schema.events.scheduledAt, start),
						lt(schema.events.scheduledAt, end)
					)
				)
				.groupBy(schema.user.id, schema.user.name)
				.orderBy(sql`count(*) desc`, schema.user.name),
			// Years with any completion or completed session — the picker chips.
			db.execute(sql`
				select distinct y from (
					select extract(year from ${schema.gameStatusHistory.changedAt})::int as y
					from ${schema.gameStatusHistory}
					where ${schema.gameStatusHistory.toStatus} = 'completed'
					union
					select extract(year from ${schema.events.scheduledAt})::int as y
					from ${schema.events}
					where ${schema.events.status} = 'completed'
				) years order by y desc
			`),
		]);

	const finished = finishedRows
		.map((row) => ({
			id: row.id,
			title: row.title,
			gameType: row.gameType,
			effort: row.effort,
			art: row.headerUrl ?? row.coverUrl,
			completedAt: new Date(row.completedAt),
		}))
		.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

	// Group GOTY (Phase 21): member ratings for this year's finished games.
	const ratingRows =
		finished.length === 0
			? []
			: await db
					.select({
						gameId: schema.gameRatings.gameId,
						rating: schema.gameRatings.rating,
						note: schema.gameRatings.note,
						name: schema.user.name,
					})
					.from(schema.gameRatings)
					.innerJoin(schema.user, eq(schema.gameRatings.userId, schema.user.id))
					.where(
						inArray(
							schema.gameRatings.gameId,
							finished.map((game) => game.id)
						)
					);
	const gotyPick = pickGoty(
		finished.map((game) => ({
			gameId: game.id,
			ratings: ratingRows.filter((row) => row.gameId === game.id).map((row) => row.rating),
		}))
	);
	const gotyGame = gotyPick ? finished.find((game) => game.id === gotyPick.gameId) : undefined;
	const goty =
		gotyPick && gotyGame
			? {
					id: gotyGame.id,
					title: gotyGame.title,
					art: gotyGame.art,
					average: averageRating(
						ratingRows.filter((row) => row.gameId === gotyGame.id).map((row) => row.rating)
					) as number,
					spread: ratingRows
						.filter((row) => row.gameId === gotyGame.id)
						.sort((a, b) => b.rating - a.rating)
						.map(({ name, rating, note }) => ({ name, rating, note })),
				}
			: null;

	const rated = sessionRows.filter(
		(row): row is typeof row & { howItWent: number } => row.howItWent !== null
	);
	const bestSession =
		rated.length > 0
			? rated.reduce((best, row) => (row.howItWent > best.howItWent ? row : best))
			: null;

	const sessionsByGame = new Map<string, number>();
	for (const row of sessionRows) {
		if (row.gameTitle) {
			sessionsByGame.set(row.gameTitle, (sessionsByGame.get(row.gameTitle) ?? 0) + 1);
		}
	}
	const mostPlayed = [...sessionsByGame.entries()]
		.map(([title, sessions]) => ({ title, sessions }))
		.sort((a, b) => b.sessions - a.sessions || a.title.localeCompare(b.title))
		.slice(0, 5);

	const minutes = sessionRows.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);

	return {
		year,
		availableYears: (yearRows.rows as { y: number }[]).map((row) => Number(row.y)),
		finished,
		totals: {
			effortBurned: finished.reduce((sum, game) => sum + (game.effort ?? 0), 0),
			gamesFinished: finished.length,
			gamesStarted: startedRows[0]?.count ?? 0,
			gamesProposed: proposedRows[0]?.count ?? 0,
			sessionsHeld: sessionRows.length,
			hoursAtTheTable: Math.round(minutes / 60),
			averageRating:
				rated.length > 0
					? Math.round((rated.reduce((sum, row) => sum + row.howItWent, 0) / rated.length) * 10) /
						10
					: null,
		},
		bestSession: bestSession
			? {
					title: bestSession.title,
					scheduledAt: bestSession.scheduledAt,
					gameTitle: bestSession.gameTitle,
					howItWent: bestSession.howItWent,
					recap: bestSession.recap,
				}
			: null,
		mostPlayed,
		presence,
		goty,
	};
}
