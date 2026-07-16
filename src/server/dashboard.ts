import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
	buildBurnRateSeries,
	PERIOD_CONFIG,
	projectCompletionDate,
	type BurnRatePeriod,
	type BurnRatePoint,
} from "@/lib/burn-rate";

export type { BurnRatePoint };

// Server-only dashboard aggregation (not a server action). Burn rate is
// derived from game_status_history — the append-only record — never from
// mutable game rows (CLAUDE.md #3). Points are the stored values, so the
// chart never rewrites history when the formula is tuned.

export type DashboardData = {
	totals: {
		totalPoints: number;
		completedPoints: number;
		completionPct: number;
		gamesTotal: number;
		gamesCompleted: number;
		backlogCount: number;
		playingCount: number;
		/** In-scope games with no points yet — excluded from point totals. */
		unscoredCount: number;
	};
	burnRate: {
		series: BurnRatePoint[];
		/** Average points/week from the regression, null without a trend. */
		weeklyRate: number | null;
		projectedCompletionDate: string | null;
	};
	playing: {
		id: string;
		title: string;
		art: string | null;
		points: number | null;
		startedAt: Date | null;
	}[];
	upcomingEvents: {
		id: string;
		title: string;
		scheduledAt: Date;
		location: string | null;
		gameTitle: string | null;
		yesCount: number;
	}[];
	activity: ActivityItem[];
	memberStats: {
		id: string;
		name: string;
		proposals: number;
		sessionsAttended: number;
	}[];
	completedEventCount: number;
};

export type ActivityItem =
	| {
			kind: "status";
			at: Date;
			actor: string | null;
			gameTitle: string;
			toStatus: (typeof schema.gameStatus.enumValues)[number];
	  }
	| {
			kind: "event";
			at: Date;
			actor: string | null;
			eventTitle: string;
			scheduledAt: Date;
	  }
	| {
			// A wrapped-up session: what was played and how it went. No actor —
			// wrap-up doesn't record who filed it, and the session was everyone's.
			kind: "session";
			at: Date;
			eventTitle: string;
			sessionNumber: number | null;
			gameTitle: string | null;
			howItWent: number | null;
	  };

export async function getDashboardData(period: BurnRatePeriod = "all"): Promise<DashboardData> {
	const db = getDb();
	const effectivePoints = sql<number | null>`coalesce(${schema.games.pointsOverride}, ${schema.games.points})`;

	const [inScopeGames, completions, playingRows, upcomingEvents] = await Promise.all([
		// The accepted body of work: proposed games aren't commitments yet,
		// and abandoned/rejected ones left it.
		db
			.select({ status: schema.games.status, points: effectivePoints })
			.from(schema.games)
			.where(sql`${schema.games.status} in ('backlog', 'playing', 'completed')`),
		db
			.select({
				gameId: schema.gameStatusHistory.gameId,
				changedAt: schema.gameStatusHistory.changedAt,
				points: effectivePoints,
			})
			.from(schema.gameStatusHistory)
			.innerJoin(schema.games, eq(schema.gameStatusHistory.gameId, schema.games.id))
			.where(
				and(
					eq(schema.gameStatusHistory.toStatus, "completed"),
					// Only currently-completed games count; a hypothetical
					// re-opened game shouldn't burn points twice.
					eq(schema.games.status, "completed")
				)
			),
		db
			.select({
				id: schema.games.id,
				title: schema.games.title,
				points: effectivePoints,
				startedAt: schema.games.startedAt,
				headerUrl: schema.gameMetadata.headerUrl,
				coverUrl: schema.gameMetadata.coverUrl,
			})
			.from(schema.games)
			.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
			.where(eq(schema.games.status, "playing")),
		db
			.select({
				id: schema.events.id,
				title: schema.events.title,
				scheduledAt: schema.events.scheduledAt,
				location: schema.events.location,
				gameTitle: schema.games.title,
				yesCount: sql<number>`(
					select count(*)::int from "event_attendance"
					where "event_attendance"."event_id" = "events"."id"
					and "event_attendance"."rsvp" = 'yes'
				)`,
			})
			.from(schema.events)
			.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
			.where(and(eq(schema.events.status, "scheduled"), sql`${schema.events.scheduledAt} > now()`))
			.orderBy(schema.events.scheduledAt)
			.limit(3),
	]);

	const [statusActivity, eventActivity, sessionActivity, memberStats, completedEvents] = await Promise.all([
		db
			.select({
				at: schema.gameStatusHistory.changedAt,
				toStatus: schema.gameStatusHistory.toStatus,
				gameTitle: schema.games.title,
				actor: schema.user.name,
			})
			.from(schema.gameStatusHistory)
			.innerJoin(schema.games, eq(schema.gameStatusHistory.gameId, schema.games.id))
			.leftJoin(schema.user, eq(schema.gameStatusHistory.changedBy, schema.user.id))
			.orderBy(sql`${schema.gameStatusHistory.changedAt} desc`)
			.limit(10),
		db
			.select({
				at: schema.events.createdAt,
				eventTitle: schema.events.title,
				scheduledAt: schema.events.scheduledAt,
				actor: schema.user.name,
			})
			.from(schema.events)
			.leftJoin(schema.user, eq(schema.events.createdBy, schema.user.id))
			.orderBy(sql`${schema.events.createdAt} desc`)
			.limit(5),
		// Wrapped-up sessions. updated_at is stamped by the wrap-up write; a
		// completed event is otherwise immutable, so it's the wrap-up time.
		db
			.select({
				at: schema.events.updatedAt,
				eventTitle: schema.events.title,
				sessionNumber: schema.events.sessionNumber,
				gameTitle: schema.games.title,
				howItWent: schema.events.howItWent,
			})
			.from(schema.events)
			.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
			.where(eq(schema.events.status, "completed"))
			.orderBy(sql`${schema.events.updatedAt} desc`)
			.limit(5),
		db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				proposals: sql<number>`(
					select count(*)::int from "games"
					where "games"."proposed_by" = "user"."id"
				)`,
				sessionsAttended: sql<number>`(
					select count(*)::int from "event_attendance"
					join "events" on "events"."id" = "event_attendance"."event_id"
					where "event_attendance"."user_id" = "user"."id"
					and "event_attendance"."attended" = true
					and "events"."status" = 'completed'
				)`,
			})
			.from(schema.user)
			.where(eq(schema.user.status, "approved"))
			.orderBy(schema.user.name),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(schema.events)
			.where(eq(schema.events.status, "completed")),
	]);

	const activity: ActivityItem[] = [
		...statusActivity.map((row) => ({ kind: "status" as const, ...row })),
		...eventActivity.map((row) => ({ kind: "event" as const, ...row })),
		...sessionActivity.map((row) => ({ kind: "session" as const, ...row })),
	]
		.sort((a, b) => b.at.getTime() - a.at.getTime())
		.slice(0, 12);

	const totalPoints = inScopeGames.reduce((sum, game) => sum + (game.points ?? 0), 0);
	const completedPoints = inScopeGames
		.filter((game) => game.status === "completed")
		.reduce((sum, game) => sum + (game.points ?? 0), 0);

	const totals = {
		totalPoints,
		completedPoints,
		completionPct: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0,
		gamesTotal: inScopeGames.length,
		gamesCompleted: inScopeGames.filter((game) => game.status === "completed").length,
		backlogCount: inScopeGames.filter((game) => game.status === "backlog").length,
		playingCount: inScopeGames.filter((game) => game.status === "playing").length,
		unscoredCount: inScopeGames.filter((game) => game.points === null).length,
	};

	// One completion event per game (earliest wins, dedup against any
	// duplicate history rows).
	const firstCompletion = new Map<string, { changedAt: Date; points: number }>();
	for (const row of completions.filter(
		(c): c is typeof c & { points: number } => c.points !== null
	)) {
		const existing = firstCompletion.get(row.gameId);
		if (!existing || row.changedAt < existing.changedAt) {
			firstCompletion.set(row.gameId, { changedAt: row.changedAt, points: row.points });
		}
	}

	const events = [...firstCompletion.values()];
	// The projection always runs on the weekly series — regressionSlope's
	// last-12 window and points/week units assume weeks. The display series
	// only changes the chart's x-axis bucketing.
	const weeklySeries = buildBurnRateSeries(events, { bucket: "week" });
	const series = buildBurnRateSeries(events, PERIOD_CONFIG[period]);
	const projection = projectCompletionDate(weeklySeries, totalPoints, completedPoints);

	return {
		totals,
		burnRate: {
			series,
			weeklyRate: projection?.weeklyRate ?? null,
			projectedCompletionDate: projection?.date ?? null,
		},
		playing: playingRows.map((row) => ({
			id: row.id,
			title: row.title,
			points: row.points,
			startedAt: row.startedAt,
			art: row.headerUrl ?? row.coverUrl,
		})),
		upcomingEvents,
		activity,
		memberStats,
		completedEventCount: completedEvents[0]?.count ?? 0,
	};
}
