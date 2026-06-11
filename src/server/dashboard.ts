import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
	buildBurnRateSeries,
	projectCompletionDate,
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
};

export async function getDashboardData(): Promise<DashboardData> {
	const db = getDb();
	const effectivePoints = sql<number | null>`coalesce(${schema.games.pointsOverride}, ${schema.games.points})`;

	const [inScopeGames, completions, playingRows] = await Promise.all([
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
	]);

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

	const series = buildBurnRateSeries([...firstCompletion.values()]);
	const projection = projectCompletionDate(series, totalPoints, completedPoints);

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
	};
}
