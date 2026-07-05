"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { notifyDiscord } from "@/lib/discord";
import { fetchGameMetadata } from "@/lib/metadata";
import { parseBggExternalId } from "@/lib/metadata/bgg";
import { deriveGameModes } from "@/lib/metadata/steam";
import type { GameMode } from "@/lib/pick";
import {
	computePoints,
	tabletopLengthHours,
	type Difficulty,
	type TtrpgLengthBand,
} from "@/lib/points";
import { buildMetadataUpdates } from "@/server/metadata-write";
import { requireAdmin, requireApprovedUser } from "@/server/session";
import { getAppSettings } from "@/server/settings";

type GameStatus = (typeof schema.gameStatus.enumValues)[number];

// The full lifecycle. Anything not listed here is an illegal transition.
const ALLOWED_TRANSITIONS: Record<GameStatus, GameStatus[]> = {
	proposed: ["backlog", "rejected"],
	backlog: ["playing", "abandoned"],
	playing: ["completed", "backlog", "abandoned"],
	completed: [],
	abandoned: ["backlog"],
	rejected: ["proposed"],
};

const proposeSchema = z.object({
	title: z.string().trim().min(1, "Title is required").max(200),
	steam: z.string().trim().max(300).optional(),
	pitch: z.string().trim().max(2000).optional(),
	// Hidden fields set when the proposer picked a search candidate. The
	// server refetches metadata from the ids itself — client-supplied
	// metadata is never trusted.
	steamAppId: z.coerce.number().int().positive().optional(),
	hltbId: z
		.string()
		.trim()
		.regex(/^\d+$/)
		.max(20)
		.optional(),
});

/** Accepts a bare app id ("1145360") or any store URL containing /app/<id>/. */
function parseSteamAppId(input?: string): number | undefined {
	if (!input) return undefined;
	const match = input.match(/^\d+$/) ?? input.match(/store\.steampowered\.com\/app\/(\d+)/);
	const id = Number(match?.[1] ?? match?.[0]);
	return Number.isInteger(id) && id > 0 ? id : undefined;
}

export async function proposeGame(formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const input = proposeSchema.parse({
		title: formData.get("title"),
		steam: formData.get("steam") || undefined,
		pitch: formData.get("pitch") || undefined,
		steamAppId: formData.get("steamAppId") || undefined,
		hltbId: formData.get("hltbId") || undefined,
	});
	const steamAppId = input.steamAppId ?? parseSteamAppId(input.steam);

	const db = getDb();

	// Friendly duplicate check — the unique constraint on steam_app_id would
	// otherwise surface as a raw DB error, and search-first proposing makes
	// re-picking an existing game much more likely.
	if (steamAppId !== undefined) {
		const [existing] = await db
			.select({ title: schema.games.title, status: schema.games.status })
			.from(schema.games)
			.where(eq(schema.games.steamAppId, steamAppId));
		if (existing) {
			throw new Error(`Already in the list as “${existing.title}” (${existing.status}).`);
		}
	}

	// Provider failures only mean fewer prefilled fields (CLAUDE.md #5).
	const { metadata, sources } = await fetchGameMetadata({
		title: input.title,
		steamAppId,
		hltbId: input.hltbId,
	});

	const lengthHours = metadata.hltbMainExtra ?? metadata.hltbMain;

	const [game] = await db
		.insert(schema.games)
		.values({
			title: metadata.title ?? input.title,
			status: "proposed",
			proposedBy: user.id,
			pitch: input.pitch,
			steamAppId,
			lengthHours: lengthHours !== undefined ? String(lengthHours) : undefined,
		})
		.returning({ id: schema.games.id });

	await db.insert(schema.gameMetadata).values({
		gameId: game.id,
		source:
			sources.length === 0
				? "manual"
				: sources.length > 1
					? "mixed"
					: (sources[0] as (typeof schema.metadataSource.enumValues)[number]),
		coverUrl: metadata.coverUrl,
		headerUrl: metadata.headerUrl,
		description: metadata.description,
		genres: metadata.genres,
		gameModes: metadata.gameModes as GameMode[] | undefined,
		releaseDate: metadata.releaseDate,
		steamReviewScore: metadata.steamReviewScore,
		steamReviewCount: metadata.steamReviewCount,
		metacriticScore: metadata.metacriticScore,
		hltbMain: metadata.hltbMain !== undefined ? String(metadata.hltbMain) : undefined,
		hltbMainExtra: metadata.hltbMainExtra !== undefined ? String(metadata.hltbMainExtra) : undefined,
		hltbCompletionist:
			metadata.hltbCompletionist !== undefined ? String(metadata.hltbCompletionist) : undefined,
		raw: metadata.raw,
		fetchedAt: sources.length > 0 ? new Date() : undefined,
	});

	await db.insert(schema.gameStatusHistory).values({
		gameId: game.id,
		fromStatus: null,
		toStatus: "proposed",
		changedBy: user.id,
	});

	notifyDiscord(
		`🎮 ${user.name} proposed **${metadata.title ?? input.title}**${input.pitch ? ` — “${input.pitch}”` : ""}`
	);
	revalidatePath("/backlog");
}

const tabletopProposeSchema = z
	.object({
		gameType: z.enum(["ttrpg", "boardgame"]),
		title: z.string().trim().min(1, "Title is required").max(200),
		pitch: z.string().trim().max(2000).optional(),
		// Game system, e.g. "D&D 5e" or "Delta Green" — the thing you'd tell a
		// friend you're running. Required for TTRPGs, optional for board games.
		system: z.string().trim().min(1).max(120).optional(),
		lengthBand: z.enum(["one_shot", "arc", "mini_campaign", "campaign"]).optional(),
		playtimeMinutes: z.coerce.number().int().positive().max(1440).optional(),
		crunch: z.coerce.number().int().min(1).max(5).optional(),
		format: z.enum(["virtual", "in_person", "hybrid"]).optional(),
		platform: z.string().trim().max(120).optional(),
		gmMe: z.coerce.boolean().optional(),
		minPlayers: z.coerce.number().int().min(1).max(99).optional(),
		maxPlayers: z.coerce.number().int().min(1).max(99).optional(),
		coverUrl: z.string().trim().url().max(500).optional(),
		// Hidden field from a BGG search pick — the server refetches from the
		// id itself; client-supplied metadata is never trusted.
		bggId: z
			.string()
			.trim()
			.regex(/^(boardgame|rpgitem):\d+$/)
			.max(30)
			.optional(),
	})
	.refine((input) => input.gameType !== "ttrpg" || input.system, {
		message: "System is required for a TTRPG (e.g. D&D 5e).",
		path: ["system"],
	})
	.refine((input) => input.gameType !== "ttrpg" || input.lengthBand, {
		message: "Pick a length band — it drives the effort estimate.",
		path: ["lengthBand"],
	})
	.refine(
		(input) =>
			input.minPlayers === undefined ||
			input.maxPlayers === undefined ||
			input.minPlayers <= input.maxPlayers,
		{ message: "Min players can't exceed max players.", path: ["minPlayers"] }
	);

/**
 * Tabletop counterpart of proposeGame — a separate action so the video
 * search-first path can't regress. Manual structured entry only in v1 (no
 * providers involved); the BGG provider slots in later without changing the
 * shape of what gets stored. Length arrives as a band (TTRPG) or playtime
 * minutes (board game) and is canonicalized into games.length_hours; crunch
 * rides the difficulty column so computePoints applies unchanged.
 */
export async function proposeTabletopGame(formData: FormData): Promise<void> {
	const user = await requireApprovedUser();
	const input = tabletopProposeSchema.parse({
		gameType: formData.get("gameType"),
		title: formData.get("title"),
		pitch: formData.get("pitch") || undefined,
		system: formData.get("system") || undefined,
		lengthBand: formData.get("lengthBand") || undefined,
		playtimeMinutes: formData.get("playtimeMinutes") || undefined,
		crunch: formData.get("crunch") || undefined,
		format: formData.get("format") || undefined,
		platform: formData.get("platform") || undefined,
		gmMe: formData.get("gmMe") || undefined,
		minPlayers: formData.get("minPlayers") || undefined,
		maxPlayers: formData.get("maxPlayers") || undefined,
		coverUrl: formData.get("coverUrl") || undefined,
		bggId: formData.get("bggId") || undefined,
	});

	const db = getDb();
	const bggNumericId = input.bggId ? parseBggExternalId(input.bggId).id : undefined;

	// Friendly duplicate check, mirroring proposeGame's steamAppId dedup.
	if (bggNumericId !== undefined) {
		const [existing] = await db
			.select({ title: schema.games.title, status: schema.games.status })
			.from(schema.tabletopDetails)
			.innerJoin(schema.games, eq(schema.tabletopDetails.gameId, schema.games.id))
			.where(eq(schema.tabletopDetails.bggId, bggNumericId));
		if (existing) {
			throw new Error(`Already in the list as “${existing.title}” (${existing.status}).`);
		}
	}

	// Optional BGG enrichment; a failure only means fewer prefilled fields
	// (CLAUDE.md #5). Fetched values fill blanks — explicit user input wins.
	const fetched = input.bggId
		? await fetchGameMetadata({ title: input.title, bggId: input.bggId })
		: null;
	const meta = fetched?.metadata;

	const system = input.system ?? meta?.system;
	const playtimeMinutes = input.playtimeMinutes ?? meta?.playtimeMinutes;
	const minPlayers = input.minPlayers ?? meta?.minPlayers;
	const maxPlayers = input.maxPlayers ?? meta?.maxPlayers;
	// BGG weight (1–5) seeds crunch as an editable prefill, never on refresh.
	const crunch =
		input.crunch ??
		(meta?.bggWeight !== undefined
			? (Math.min(5, Math.max(1, Math.round(meta.bggWeight))) as Difficulty)
			: undefined);

	const lengthHours = tabletopLengthHours({
		gameType: input.gameType,
		lengthBand: input.lengthBand as TtrpgLengthBand | undefined,
		playtimeMinutes,
	});

	let points: number | undefined;
	if (lengthHours && crunch) {
		const settings = await getAppSettings();
		points = computePoints(lengthHours, crunch as Difficulty, settings.difficultyMultipliers, {
			weight: settings.qualityWeight,
			signals: { bggRating: meta?.bggRating },
		});
	}

	const [game] = await db
		.insert(schema.games)
		.values({
			title: meta?.title ?? input.title,
			gameType: input.gameType,
			status: "proposed",
			proposedBy: user.id,
			pitch: input.pitch,
			lengthHours: lengthHours !== undefined ? String(lengthHours) : undefined,
			difficulty: crunch,
			points,
		})
		.returning({ id: schema.games.id });

	await db.insert(schema.tabletopDetails).values({
		gameId: game.id,
		bggId: bggNumericId,
		system,
		format: input.format,
		platform: input.platform,
		gmUserId: input.gameType === "ttrpg" && input.gmMe ? user.id : undefined,
		minPlayers,
		maxPlayers,
		lengthBand: input.lengthBand,
		playtimeMinutes,
	});

	const bggFetched = (fetched?.sources.length ?? 0) > 0;
	await db.insert(schema.gameMetadata).values({
		gameId: game.id,
		source: bggFetched ? "bgg" : "manual",
		coverUrl: input.coverUrl ?? meta?.coverUrl,
		description: meta?.description,
		genres: meta?.genres,
		bggRating: meta?.bggRating,
		bggWeight: meta?.bggWeight !== undefined ? String(meta.bggWeight) : undefined,
		raw: meta?.raw,
		fetchedAt: bggFetched ? new Date() : undefined,
	});

	await db.insert(schema.gameStatusHistory).values({
		gameId: game.id,
		fromStatus: null,
		toStatus: "proposed",
		changedBy: user.id,
	});

	const flavor =
		input.gameType === "ttrpg"
			? `${system}${input.lengthBand === "one_shot" ? " one-shot" : input.lengthBand === "campaign" ? " campaign" : ""}`
			: "board game";
	notifyDiscord(
		`🎲 ${user.name} proposed **${meta?.title ?? input.title}** (${flavor})${input.pitch ? ` — “${input.pitch}”` : ""}`
	);
	revalidatePath("/backlog");
}

// The ONLY way to change a game's status (CLAUDE.md #3): validates the
// transition, maintains started/completed timestamps, appends history, and
// clears votes when a game leaves the backlog (frees vote budget).
export async function transitionGameStatus(gameId: string, toStatus: GameStatus): Promise<void> {
	const user = await requireApprovedUser();
	const db = getDb();

	const [game] = await db
		.select({
			id: schema.games.id,
			status: schema.games.status,
			title: schema.games.title,
		})
		.from(schema.games)
		.where(eq(schema.games.id, gameId));
	if (!game) throw new Error("Game not found.");

	if (!ALLOWED_TRANSITIONS[game.status].includes(toStatus)) {
		throw new Error(`Can't move a ${game.status} game to ${toStatus}.`);
	}

	await db
		.update(schema.games)
		.set({
			status: toStatus,
			...(toStatus === "playing" ? { startedAt: new Date() } : {}),
			...(toStatus === "completed" ? { completedAt: new Date() } : {}),
			updatedAt: new Date(),
		})
		// Guard against a concurrent transition having already moved it.
		.where(and(eq(schema.games.id, gameId), eq(schema.games.status, game.status)));

	await db.insert(schema.gameStatusHistory).values({
		gameId,
		fromStatus: game.status,
		toStatus,
		changedBy: user.id,
	});

	if (game.status === "backlog") {
		await db.delete(schema.votes).where(eq(schema.votes.gameId, gameId));
	}

	if (toStatus === "completed") {
		notifyDiscord(`🏆 The group finished **${game.title}**!`);
	} else if (toStatus === "playing") {
		notifyDiscord(`▶️ Now playing: **${game.title}**`);
	}

	revalidatePath("/backlog");
	revalidatePath("/pick");
	revalidatePath("/");
}

const scoringSchema = z.object({
	lengthHours: z.coerce.number().positive().max(9999).optional(),
	// Tabletop length inputs — the UI shows band/minutes, never raw hours.
	lengthBand: z.enum(["one_shot", "arc", "mini_campaign", "campaign"]).optional(),
	playtimeMinutes: z.coerce.number().int().positive().max(1440).optional(),
	// "Crunch" in the tabletop UI; same column, same multipliers.
	difficulty: z.coerce.number().int().min(1).max(5).optional(),
	pointsOverride: z.coerce.number().int().min(0).max(999).optional(),
});

// Recomputes stored points whenever the inputs change (CLAUDE.md #2);
// an explicit override always wins, and clearing it falls back to the formula.
export async function updateGameScoring(gameId: string, formData: FormData): Promise<void> {
	await requireApprovedUser();
	const input = scoringSchema.parse({
		lengthHours: formData.get("lengthHours") || undefined,
		lengthBand: formData.get("lengthBand") || undefined,
		playtimeMinutes: formData.get("playtimeMinutes") || undefined,
		difficulty: formData.get("difficulty") || undefined,
		pointsOverride: formData.get("pointsOverride") || undefined,
	});

	const db = getDb();
	const [game] = await db
		.select({
			gameType: schema.games.gameType,
			lengthHours: schema.games.lengthHours,
			difficulty: schema.games.difficulty,
			steamReviewScore: schema.gameMetadata.steamReviewScore,
			metacriticScore: schema.gameMetadata.metacriticScore,
			bggRating: schema.gameMetadata.bggRating,
			lengthBand: schema.tabletopDetails.lengthBand,
			playtimeMinutes: schema.tabletopDetails.playtimeMinutes,
		})
		.from(schema.games)
		.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
		.leftJoin(schema.tabletopDetails, eq(schema.games.id, schema.tabletopDetails.gameId))
		.where(eq(schema.games.id, gameId));
	if (!game) throw new Error("Game not found.");

	// Tabletop games edit length via band/minutes; the server derives the
	// hour-equivalent so raw hours never round-trip through the UI.
	let lengthHours: number | undefined;
	if (game.gameType === "video") {
		lengthHours = input.lengthHours ?? (game.lengthHours ? Number(game.lengthHours) : undefined);
	} else {
		const lengthBand = (input.lengthBand ?? game.lengthBand ?? undefined) as
			| TtrpgLengthBand
			| undefined;
		const playtimeMinutes = input.playtimeMinutes ?? game.playtimeMinutes ?? undefined;
		lengthHours = tabletopLengthHours({ gameType: game.gameType, lengthBand, playtimeMinutes });
		await db
			.update(schema.tabletopDetails)
			.set({
				...(game.gameType === "ttrpg" && lengthBand ? { lengthBand } : {}),
				...(game.gameType === "boardgame" && playtimeMinutes ? { playtimeMinutes } : {}),
				updatedAt: new Date(),
			})
			.where(eq(schema.tabletopDetails.gameId, gameId));
	}
	const difficulty = (input.difficulty ?? game.difficulty ?? undefined) as Difficulty | undefined;

	let points: number | undefined;
	if (lengthHours && difficulty) {
		const settings = await getAppSettings();
		points = computePoints(lengthHours, difficulty, settings.difficultyMultipliers, {
			weight: settings.qualityWeight,
			signals: {
				steamReviewScore: game.steamReviewScore,
				metacriticScore: game.metacriticScore,
				bggRating: game.bggRating,
			},
		});
	}

	await db
		.update(schema.games)
		.set({
			lengthHours: lengthHours !== undefined ? String(lengthHours) : null,
			difficulty: difficulty ?? null,
			points: points ?? null,
			pointsOverride: input.pointsOverride ?? null,
			updatedAt: new Date(),
		})
		.where(eq(schema.games.id, gameId));

	revalidatePath("/backlog");
}

/**
 * Admin-only bulk refresh after tuning the formula settings: re-runs
 * computePoints for proposed and backlog games only. Playing, completed,
 * abandoned, and rejected games are never touched (CLAUDE.md #2 — burn-rate
 * history stays stable), and pointsOverride is left alone (it wins over
 * points everywhere it's read).
 */
export async function recomputeUnplayedPoints(): Promise<void> {
	await requireAdmin();
	const settings = await getAppSettings();
	const db = getDb();

	const rows = await db
		.select({
			gameId: schema.games.id,
			lengthHours: schema.games.lengthHours,
			difficulty: schema.games.difficulty,
			steamReviewScore: schema.gameMetadata.steamReviewScore,
			metacriticScore: schema.gameMetadata.metacriticScore,
			bggRating: schema.gameMetadata.bggRating,
		})
		.from(schema.games)
		.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
		.where(inArray(schema.games.status, ["proposed", "backlog"]));

	for (const row of rows) {
		if (!row.lengthHours || !row.difficulty) continue;
		const points = computePoints(
			Number(row.lengthHours),
			row.difficulty as Difficulty,
			settings.difficultyMultipliers,
			{
				weight: settings.qualityWeight,
				signals: {
					steamReviewScore: row.steamReviewScore,
					metacriticScore: row.metacriticScore,
					bggRating: row.bggRating,
				},
			}
		);
		await db
			.update(schema.games)
			.set({ points, updatedAt: new Date() })
			.where(eq(schema.games.id, row.gameId));
	}

	revalidatePath("/backlog");
	revalidatePath("/pick");
	revalidatePath("/");
}

/**
 * Explicit per-game re-fetch from the providers — the in-app recourse when
 * a lookup failed at proposal time (HLTB especially). Unlike the cron, this
 * also runs for manual-only rows because the user asked for it; fetched
 * fields will overwrite manual entries, which the UI warns about. Never
 * touches games.* (CLAUDE.md #2).
 */
export async function refreshGameMetadata(gameId: string): Promise<void> {
	await requireApprovedUser();
	const db = getDb();

	const [row] = await db
		.select({
			title: schema.games.title,
			gameType: schema.games.gameType,
			steamAppId: schema.games.steamAppId,
			bggId: schema.tabletopDetails.bggId,
			source: schema.gameMetadata.source,
			raw: schema.gameMetadata.raw,
		})
		.from(schema.games)
		.innerJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
		.leftJoin(schema.tabletopDetails, eq(schema.games.id, schema.tabletopDetails.gameId))
		.where(eq(schema.games.id, gameId));
	if (!row) throw new Error("Game not found.");

	// Tabletop refresh needs a pinned BGG id — a title search against
	// Steam/HLTB would match the wrong medium and clobber manual entries.
	if (row.gameType !== "video" && !row.bggId) {
		throw new Error("This tabletop game is manual-entry — no BGG id to refresh from.");
	}

	// Claim-style stamp first (no transactions on Neon HTTP): a mid-flight
	// failure still records the attempt for the cron's stale queue.
	await db
		.update(schema.gameMetadata)
		.set({ lastRefreshAttemptAt: new Date() })
		.where(eq(schema.gameMetadata.gameId, gameId));

	const result = await fetchGameMetadata({
		title: row.title,
		steamAppId: row.steamAppId ?? undefined,
		bggId: row.bggId
			? `${row.gameType === "ttrpg" ? "rpgitem" : "boardgame"}:${row.bggId}`
			: undefined,
	});
	if (result.sources.length === 0) {
		throw new Error("All metadata providers failed — try again later.");
	}

	await db
		.update(schema.gameMetadata)
		.set(buildMetadataUpdates(row, result))
		.where(eq(schema.gameMetadata.gameId, gameId));

	revalidatePath("/backlog");
	revalidatePath("/pick");
}

/**
 * Admin one-shot: derive game_modes for existing games from the Steam
 * appdetails payloads already stored in game_metadata.raw — no network.
 * Rows without steam raw stay null ("unknown" to the picker) until their
 * next provider fetch. Idempotent; safe to re-run.
 */
export async function backfillGameModes(): Promise<void> {
	await requireAdmin();
	const db = getDb();

	const rows = await db
		.select({ gameId: schema.gameMetadata.gameId, raw: schema.gameMetadata.raw })
		.from(schema.gameMetadata)
		.where(and(isNull(schema.gameMetadata.gameModes), isNotNull(schema.gameMetadata.raw)));

	for (const row of rows) {
		// raw is untyped jsonb — narrow defensively; malformed shapes are skipped.
		const raw = row.raw as { steam?: { appdetails?: { categories?: unknown } } } | null;
		const categories = raw?.steam?.appdetails?.categories;
		if (!Array.isArray(categories)) continue;
		const modes = deriveGameModes(
			categories.filter(
				(entry): entry is { id: number; description: string } =>
					typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "number"
			)
		);
		if (!modes) continue;
		await db
			.update(schema.gameMetadata)
			.set({ gameModes: modes })
			.where(eq(schema.gameMetadata.gameId, row.gameId));
	}

	revalidatePath("/pick");
	revalidatePath("/backlog");
}
