"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { notifyDiscord } from "@/lib/discord";
import { fetchGameMetadata } from "@/lib/metadata";
import { computePoints, type Difficulty } from "@/lib/points";
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
	});
	const steamAppId = parseSteamAppId(input.steam);

	// Provider failures only mean fewer prefilled fields (CLAUDE.md #5).
	const { metadata, sources } = await fetchGameMetadata({ title: input.title, steamAppId });

	const db = getDb();
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
			sources.length === 0 ? "manual" : sources.length > 1 ? "mixed" : (sources[0] as "steam" | "hltb"),
		coverUrl: metadata.coverUrl,
		headerUrl: metadata.headerUrl,
		description: metadata.description,
		genres: metadata.genres,
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
	revalidatePath("/vote");
	revalidatePath("/");
}

const scoringSchema = z.object({
	lengthHours: z.coerce.number().positive().max(9999).optional(),
	difficulty: z.coerce.number().int().min(1).max(5).optional(),
	pointsOverride: z.coerce.number().int().min(0).max(999).optional(),
});

// Recomputes stored points whenever the inputs change (CLAUDE.md #2);
// an explicit override always wins, and clearing it falls back to the formula.
export async function updateGameScoring(gameId: string, formData: FormData): Promise<void> {
	await requireApprovedUser();
	const input = scoringSchema.parse({
		lengthHours: formData.get("lengthHours") || undefined,
		difficulty: formData.get("difficulty") || undefined,
		pointsOverride: formData.get("pointsOverride") || undefined,
	});

	const db = getDb();
	const [game] = await db
		.select({
			lengthHours: schema.games.lengthHours,
			difficulty: schema.games.difficulty,
			steamReviewScore: schema.gameMetadata.steamReviewScore,
			metacriticScore: schema.gameMetadata.metacriticScore,
		})
		.from(schema.games)
		.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
		.where(eq(schema.games.id, gameId));
	if (!game) throw new Error("Game not found.");

	const lengthHours = input.lengthHours ?? (game.lengthHours ? Number(game.lengthHours) : undefined);
	const difficulty = (input.difficulty ?? game.difficulty ?? undefined) as Difficulty | undefined;

	let points: number | undefined;
	if (lengthHours && difficulty) {
		const settings = await getAppSettings();
		points = computePoints(lengthHours, difficulty, settings.difficultyMultipliers, {
			weight: settings.qualityWeight,
			signals: {
				steamReviewScore: game.steamReviewScore,
				metacriticScore: game.metacriticScore,
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
				},
			}
		);
		await db
			.update(schema.games)
			.set({ points, updatedAt: new Date() })
			.where(eq(schema.games.id, row.gameId));
	}

	revalidatePath("/backlog");
	revalidatePath("/vote");
	revalidatePath("/");
}
