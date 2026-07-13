// Read-side assembly for the /pick page (server-only, not a server action —
// callers sit behind the (app) layout's requireApprovedUser gate, same as
// dashboard.ts). Vote data enters ONLY as aggregates via getVoteTally();
// the anonymity invariant is untouched.

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
	scoreBacklog,
	type Commitment,
	type GameMode,
	type PickKind,
	type PickableGame,
	type RankedGame,
	type SessionContext,
} from "@/lib/pick";
import { getAppSettings, type AppSettings } from "@/server/settings";
import { getMyBallot, getVoteTally } from "@/server/votes";

const COMMITMENTS: Commitment[] = ["snack", "weeknight", "standard", "epic", "any"];
const KINDS: PickKind[] = ["any", "video", "ttrpg", "boardgame"];

/**
 * Session context comes from user-editable URL params — clamp and default,
 * never throw on a GET.
 */
export function parsePickContext(params: {
	hours?: string;
	commitment?: string;
	players?: string;
	together?: string;
	kind?: string;
	genre?: string;
}): SessionContext {
	const hours = Number(params.hours);
	const players = Number(params.players);
	const genre = params.genre?.trim();
	return {
		sessionHours:
			Number.isFinite(hours) && hours > 0 ? Math.min(200, Math.max(0.5, hours)) : undefined,
		commitment: COMMITMENTS.includes(params.commitment as Commitment)
			? (params.commitment as Commitment)
			: "any",
		players:
			Number.isInteger(players) && players > 0 ? Math.min(20, players) : undefined,
		together: params.together === "1",
		kind: KINDS.includes(params.kind as PickKind) ? (params.kind as PickKind) : "any",
		// Free text matched against metadata.genres; a bogus value just yields
		// an empty list — never throw on a GET.
		genre: genre && genre.length <= 60 ? genre : undefined,
	};
}

export type PickGameRow = {
	id: string;
	title: string;
	gameType: "video" | "ttrpg" | "boardgame";
	/** Tabletop system ("D&D 5e") — display only. */
	system: string | null;
	art: string | null;
	/** Effort (stored points, override wins) — display only, not a rank input. */
	effort: number | null;
	lengthHours: number | null;
	genres: string[] | null;
	gameModes: GameMode[] | null;
	playerRange: { min: number | null; max: number | null } | null;
	backlogSince: Date | null;
	/** Group aggregate including the caller's own allocation. */
	groupTotal: number;
	/** The caller's own allocation. */
	mine: number;
};

export type PickData = {
	ranked: RankedGame[];
	games: Map<string, PickGameRow>;
	remainingBudget: number;
	settings: AppSettings;
	/** Distinct genres across the (kind-filtered) backlog — feeds the chips. */
	genres: string[];
	nextEvent: {
		title: string;
		scheduledAt: Date;
		durationMinutes: number | null;
		yesCount: number;
	} | null;
};

export async function getPickData(ctx: SessionContext): Promise<PickData> {
	const db = getDb();

	const [rows, ballot, tally, settings, nextEvents] = await Promise.all([
		db
			.select({
				id: schema.games.id,
				title: schema.games.title,
				gameType: schema.games.gameType,
				points: schema.games.points,
				pointsOverride: schema.games.pointsOverride,
				lengthHours: schema.games.lengthHours,
				headerUrl: schema.gameMetadata.headerUrl,
				coverUrl: schema.gameMetadata.coverUrl,
				genres: schema.gameMetadata.genres,
				gameModes: schema.gameMetadata.gameModes,
				steamReviewScore: schema.gameMetadata.steamReviewScore,
				metacriticScore: schema.gameMetadata.metacriticScore,
				bggRating: schema.gameMetadata.bggRating,
				system: schema.tabletopDetails.system,
				minPlayers: schema.tabletopDetails.minPlayers,
				maxPlayers: schema.tabletopDetails.maxPlayers,
			})
			.from(schema.games)
			.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
			.leftJoin(schema.tabletopDetails, eq(schema.games.id, schema.tabletopDetails.gameId))
			.where(
				and(
					eq(schema.games.status, "backlog"),
					// "What kind of night is it?" — a filter, not a component.
					...(ctx.kind !== "any" ? [eq(schema.games.gameType, ctx.kind)] : [])
				)
			),
		getMyBallot(),
		getVoteTally(),
		getAppSettings(),
		db
			.select({
				title: schema.events.title,
				scheduledAt: schema.events.scheduledAt,
				durationMinutes: schema.events.durationMinutes,
				yesCount: sql<number>`(
					select count(*)::int from "event_attendance"
					where "event_attendance"."event_id" = "events"."id"
					and "event_attendance"."rsvp" = 'yes'
				)`,
			})
			.from(schema.events)
			.where(and(eq(schema.events.status, "scheduled"), sql`${schema.events.scheduledAt} > now()`))
			.orderBy(schema.events.scheduledAt)
			.limit(1),
	]);

	// Genre chips offer what the (kind-filtered) backlog actually has; the
	// active genre then narrows the rows below. Like kind: a filter, never a
	// scored component.
	const genres = [...new Set(rows.flatMap((row) => row.genres ?? []))].sort();
	const genreRows = ctx.genre
		? rows.filter((row) => (row.genres ?? []).includes(ctx.genre as string))
		: rows;

	// Staleness input: the latest transition INTO backlog (a re-backlogged
	// game restarts its clock). Second query rather than a join so the main
	// row select stays simple.
	const backlogSinceByGame = new Map<string, Date>();
	if (rows.length > 0) {
		const entries = await db
			.select({
				gameId: schema.gameStatusHistory.gameId,
				enteredAt: sql<string>`max(${schema.gameStatusHistory.changedAt})`,
			})
			.from(schema.gameStatusHistory)
			.where(
				and(
					eq(schema.gameStatusHistory.toStatus, "backlog"),
					inArray(
						schema.gameStatusHistory.gameId,
						rows.map((row) => row.id)
					)
				)
			)
			.groupBy(schema.gameStatusHistory.gameId);
		for (const entry of entries) {
			backlogSinceByGame.set(entry.gameId, new Date(entry.enteredAt));
		}
	}

	const tallyByGame = new Map(tally.map((entry) => [entry.gameId, entry.totalWeight]));
	const mineByGame = new Map(ballot.allocations.map((entry) => [entry.gameId, entry.weight]));

	// Pre-sort by title: scoreBacklog's sort is stable, so equal-score games
	// come back in a human-sensible order.
	const sortedRows = [...genreRows].sort((a, b) => a.title.localeCompare(b.title));

	const playerRange = (row: { gameType: string; minPlayers: number | null; maxPlayers: number | null }) =>
		row.gameType !== "video" ? { min: row.minPlayers, max: row.maxPlayers } : null;

	const pickable: PickableGame[] = sortedRows.map((row) => ({
		gameId: row.id,
		gameType: row.gameType,
		lengthHours: row.lengthHours !== null ? Number(row.lengthHours) : null,
		signals: {
			steamReviewScore: row.steamReviewScore,
			metacriticScore: row.metacriticScore,
			bggRating: row.bggRating,
		},
		tally: tallyByGame.get(row.id) ?? 0,
		backlogSince: backlogSinceByGame.get(row.id) ?? null,
		gameModes: row.gameModes,
		playerRange: playerRange(row),
	}));

	const games = new Map<string, PickGameRow>(
		sortedRows.map((row) => [
			row.id,
			{
				id: row.id,
				title: row.title,
				gameType: row.gameType,
				system: row.system,
				art: row.headerUrl ?? row.coverUrl,
				effort: row.pointsOverride ?? row.points,
				lengthHours: row.lengthHours !== null ? Number(row.lengthHours) : null,
				genres: row.genres,
				gameModes: row.gameModes,
				playerRange: playerRange(row),
				backlogSince: backlogSinceByGame.get(row.id) ?? null,
				groupTotal: tallyByGame.get(row.id) ?? 0,
				mine: mineByGame.get(row.id) ?? 0,
			},
		])
	);

	return {
		ranked: scoreBacklog(pickable, ctx, settings.pickWeights),
		games,
		remainingBudget: ballot.remainingBudget,
		settings,
		genres,
		nextEvent: nextEvents[0] ?? null,
	};
}
