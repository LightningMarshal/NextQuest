// Local-dev seed: a demo group with games in every status, votes, tags,
// events, and an availability poll — so a fresh checkout has something to
// look at without hand-rolling SQL (Phase 18).
//
// Usage:
//   npm run seed            # aborts if the database already has data
//   npm run seed -- --reset # wipes app data (and demo users) first
//
// Runs under Node against DATABASE_URL from .env (same file drizzle-kit
// uses), over the same Neon HTTP driver as the app. Demo members are rows
// only — they can't sign in; your real Google account joins alongside them.
import "dotenv/config";

import { neon, neonConfig } from "@neondatabase/serverless";
import { count, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";
import type { GameMode } from "@/lib/pick";
import {
	computePoints,
	DEFAULT_QUALITY_WEIGHT,
	tabletopLengthHours,
	type Difficulty,
	type QualitySignals,
	type TtrpgLengthBand,
} from "@/lib/points";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL is not set — copy .env.example to .env first.");
	process.exit(1);
}
// Same local-dev escape hatch as src/db/index.ts.
if (process.env.NEON_HTTP_PROXY_ENDPOINT) {
	neonConfig.fetchEndpoint = process.env.NEON_HTTP_PROXY_ENDPOINT;
}
const db = drizzle(neon(databaseUrl), { schema });

const reset = process.argv.includes("--reset");

// --- Deterministic ids ------------------------------------------------------
// Valid v4-shaped UUIDs with a recognizable "5eed" prefix, so reseeding is
// stable and seeded rows are easy to spot in the database.

function seedId(block: string, n: number): string {
	return `5eed${block}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
const gameId = (n: number) => seedId("0001", n);
const eventId = (n: number) => seedId("0002", n);
const tagId = (n: number) => seedId("0003", n);
const pollId = (n: number) => seedId("0004", n);
const optionId = (n: number) => seedId("0005", n);
const historyId = (n: number) => seedId("0006", n);
const voteId = (n: number) => seedId("0007", n);

// --- Time helpers -----------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY_MS);
/** n days out at a fixed evening hour, so poll slots look like real plans. */
function eveningIn(n: number, hour = 19): Date {
	const date = daysFromNow(n);
	date.setUTCHours(hour, 0, 0, 0);
	return date;
}

// --- Demo members -----------------------------------------------------------

const alex = "seed-alex";
const brooke = "seed-brooke";
const casey = "seed-casey";
const drew = "seed-drew";

const users = [
	{ id: alex, name: "Alex Ortega", email: "alex@example.com", role: "admin", status: "approved" },
	{ id: brooke, name: "Brooke Tran", email: "brooke@example.com", role: "member", status: "approved" },
	{ id: casey, name: "Casey Nwosu", email: "casey@example.com", role: "member", status: "approved" },
	{ id: drew, name: "Drew Kaplan", email: "drew@example.com", role: "member", status: "approved" },
	// Sits in the admin approval queue as a demo of the membership flow.
	{ id: "seed-elliot", name: "Elliot Reyes", email: "elliot@example.com", role: "member", status: "pending" },
] satisfies (typeof schema.user.$inferInsert)[];

// --- Games ------------------------------------------------------------------

type VideoSeed = {
	n: number;
	title: string;
	status: (typeof schema.gameStatus.enumValues)[number];
	proposedBy: string;
	pitch: string;
	steamAppId?: number;
	/** Main + Extra hours (the games.length_hours convention). */
	hours?: number;
	difficulty?: Difficulty;
	metadata?: {
		genres: string[];
		gameModes: GameMode[];
		releaseDate: string;
		steamReviewScore: number;
		steamReviewCount: number;
		metacriticScore: number;
		hltbMain: number;
		hltbMainExtra: number;
		hltbCompletionist: number;
	};
	startedDaysAgo?: number;
	completedDaysAgo?: number;
};

const videoGames: VideoSeed[] = [
	{
		n: 1,
		title: "Baldur's Gate 3",
		status: "playing",
		proposedBy: alex,
		pitch: "The whole party in one save file. We take turns driving.",
		steamAppId: 1086940,
		hours: 100,
		difficulty: 3,
		startedDaysAgo: 21,
		metadata: {
			genres: ["RPG", "Adventure"],
			gameModes: ["single-player", "multi-player", "co-op", "online-co-op"],
			releaseDate: "2023-08-03",
			steamReviewScore: 96,
			steamReviewCount: 550_000,
			metacriticScore: 96,
			hltbMain: 55,
			hltbMainExtra: 100,
			hltbCompletionist: 150,
		},
	},
	{
		n: 2,
		title: "Portal 2",
		status: "completed",
		proposedBy: brooke,
		pitch: "Co-op chambers. Nobody rage-quits. Probably.",
		steamAppId: 620,
		hours: 13,
		difficulty: 2,
		startedDaysAgo: 70,
		completedDaysAgo: 56,
		metadata: {
			genres: ["Puzzle", "Platformer"],
			gameModes: ["single-player", "co-op", "online-co-op", "local-co-op"],
			releaseDate: "2011-04-18",
			steamReviewScore: 98,
			steamReviewCount: 380_000,
			metacriticScore: 95,
			hltbMain: 8.5,
			hltbMainExtra: 13,
			hltbCompletionist: 21,
		},
	},
	{
		n: 3,
		title: "Hades",
		status: "completed",
		proposedBy: casey,
		pitch: "One more run. We pass the controller on every death.",
		steamAppId: 1145360,
		hours: 40,
		difficulty: 3,
		startedDaysAgo: 49,
		completedDaysAgo: 28,
		metadata: {
			genres: ["Roguelike", "Action"],
			gameModes: ["single-player"],
			releaseDate: "2020-09-17",
			steamReviewScore: 98,
			steamReviewCount: 250_000,
			metacriticScore: 93,
			hltbMain: 21,
			hltbMainExtra: 40,
			hltbCompletionist: 96,
		},
	},
	{
		n: 4,
		title: "Celeste",
		status: "completed",
		proposedBy: drew,
		pitch: "The B-sides broke Drew. Worth it.",
		steamAppId: 504230,
		hours: 12,
		difficulty: 4,
		startedDaysAgo: 21,
		completedDaysAgo: 7,
		metadata: {
			genres: ["Platformer", "Indie"],
			gameModes: ["single-player"],
			releaseDate: "2018-01-25",
			steamReviewScore: 97,
			steamReviewCount: 90_000,
			metacriticScore: 94,
			hltbMain: 8,
			hltbMainExtra: 12,
			hltbCompletionist: 37,
		},
	},
	{
		n: 5,
		title: "Outer Wilds",
		status: "backlog",
		proposedBy: brooke,
		pitch: "Go in blind. No wiki. Trust me.",
		steamAppId: 753640,
		hours: 22,
		difficulty: 3,
		metadata: {
			genres: ["Adventure", "Exploration"],
			gameModes: ["single-player"],
			releaseDate: "2019-05-28",
			steamReviewScore: 95,
			steamReviewCount: 60_000,
			metacriticScore: 85,
			hltbMain: 17,
			hltbMainExtra: 22,
			hltbCompletionist: 30,
		},
	},
	{
		n: 6,
		title: "Disco Elysium",
		status: "backlog",
		proposedBy: alex,
		pitch: "A detective RPG where the dice roll your personality.",
		steamAppId: 632470,
		hours: 30,
		difficulty: 2,
		metadata: {
			genres: ["RPG", "Story Rich"],
			gameModes: ["single-player"],
			releaseDate: "2019-10-15",
			steamReviewScore: 92,
			steamReviewCount: 80_000,
			metacriticScore: 91,
			hltbMain: 21,
			hltbMainExtra: 30,
			hltbCompletionist: 47,
		},
	},
	{
		n: 7,
		title: "It Takes Two",
		status: "backlog",
		proposedBy: casey,
		pitch: "Mandatory two-player. Friend Pass means one copy covers us.",
		steamAppId: 1426210,
		hours: 14,
		difficulty: 2,
		metadata: {
			genres: ["Adventure", "Co-op"],
			gameModes: ["co-op", "online-co-op", "local-co-op"],
			releaseDate: "2021-03-26",
			steamReviewScore: 96,
			steamReviewCount: 220_000,
			metacriticScore: 88,
			hltbMain: 12,
			hltbMainExtra: 14,
			hltbCompletionist: 17,
		},
	},
	{
		n: 8,
		title: "Elden Ring",
		status: "backlog",
		proposedBy: drew,
		pitch: "The big one. We summon each other and suffer together.",
		steamAppId: 1245620,
		hours: 100,
		difficulty: 5,
		metadata: {
			genres: ["Action RPG", "Souls-like"],
			gameModes: ["single-player", "multi-player", "co-op", "online-co-op", "pvp"],
			releaseDate: "2022-02-25",
			steamReviewScore: 92,
			steamReviewCount: 700_000,
			metacriticScore: 94,
			hltbMain: 60,
			hltbMainExtra: 100,
			hltbCompletionist: 135,
		},
	},
	{
		n: 9,
		title: "Tunic",
		status: "proposed",
		proposedBy: brooke,
		pitch: "Zelda-like fox game with a manual you piece together.",
		steamAppId: 553420,
		hours: 15,
		difficulty: 3,
		metadata: {
			genres: ["Adventure", "Puzzle"],
			gameModes: ["single-player"],
			releaseDate: "2022-03-16",
			steamReviewScore: 94,
			steamReviewCount: 30_000,
			metacriticScore: 85,
			hltbMain: 12,
			hltbMainExtra: 15,
			hltbCompletionist: 25,
		},
	},
	{
		// Manual proposal with no metadata at all — the degraded path every
		// provider failure falls back to. No length/difficulty → no points yet.
		n: 10,
		title: "Vintage Story",
		status: "proposed",
		proposedBy: drew,
		pitch: "Not on Steam. Like Minecraft if winter wanted you dead.",
	},
];

function videoQuality(metadata: VideoSeed["metadata"]): QualitySignals {
	return {
		steamReviewScore: metadata?.steamReviewScore ?? null,
		metacriticScore: metadata?.metacriticScore ?? null,
	};
}

type TabletopSeed = {
	n: number;
	title: string;
	gameType: "ttrpg" | "boardgame";
	status: (typeof schema.gameStatus.enumValues)[number];
	proposedBy: string;
	pitch: string;
	crunch: Difficulty;
	bggId?: number;
	system?: string;
	format?: (typeof schema.tabletopFormat.enumValues)[number];
	platform?: string;
	gmUserId?: string;
	minPlayers?: number;
	maxPlayers?: number;
	lengthBand?: TtrpgLengthBand;
	playtimeMinutes?: number;
	bggRating?: number;
	bggWeight?: number;
	startedDaysAgo?: number;
};

const tabletopGames: TabletopSeed[] = [
	{
		n: 11,
		title: "Curse of Strahd",
		gameType: "ttrpg",
		status: "playing",
		proposedBy: alex,
		pitch: "Gothic horror campaign. Alex has been prepping for months.",
		crunch: 3,
		system: "D&D 5e",
		format: "hybrid",
		platform: "Roll20 + kitchen table",
		gmUserId: alex,
		minPlayers: 3,
		maxPlayers: 6,
		lengthBand: "campaign",
		bggRating: 87,
		startedDaysAgo: 77,
	},
	{
		n: 12,
		title: "Wingspan",
		gameType: "boardgame",
		status: "backlog",
		proposedBy: casey,
		pitch: "Birds. Engines. Casey owns the fancy egg tokens.",
		crunch: 2,
		bggId: 266192,
		minPlayers: 1,
		maxPlayers: 5,
		playtimeMinutes: 70,
		bggRating: 79,
		bggWeight: 2.4,
	},
	{
		n: 13,
		title: "The Quiet Year",
		gameType: "ttrpg",
		status: "proposed",
		proposedBy: brooke,
		pitch: "GM-less map game. One evening, one doomed community.",
		crunch: 1,
		system: "The Quiet Year",
		format: "in_person",
		minPlayers: 2,
		maxPlayers: 4,
		lengthBand: "one_shot",
	},
];

// --- Seeding ----------------------------------------------------------------

async function wipe() {
	// Children before parents; auth rows are kept except the demo members.
	await db.delete(schema.availabilityMarks);
	await db.delete(schema.availabilityResponses);
	await db.delete(schema.availabilityOptions);
	await db.delete(schema.eventAttendance);
	await db.delete(schema.events);
	await db.delete(schema.availabilityPolls);
	await db.delete(schema.gameVoteMilestones);
	await db.delete(schema.votes);
	await db.delete(schema.gameTags);
	await db.delete(schema.tags);
	await db.delete(schema.gameStatusHistory);
	await db.delete(schema.tabletopDetails);
	await db.delete(schema.gameMetadata);
	await db.delete(schema.games);
	await db.delete(schema.user).where(like(schema.user.id, "seed-%"));
}

async function main() {
	const [{ value: existingGames }] = await db.select({ value: count() }).from(schema.games);
	const [{ value: existingSeedUsers }] = await db
		.select({ value: count() })
		.from(schema.user)
		.where(like(schema.user.id, "seed-%"));

	if (existingGames > 0 || existingSeedUsers > 0) {
		if (!reset) {
			console.error(
				`Database already has data (${existingGames} games, ${existingSeedUsers} demo members). ` +
					"Re-run with --reset to wipe app data and reseed:\n  npm run seed -- --reset"
			);
			process.exit(1);
		}
		console.log("Wiping existing app data (--reset)…");
		await wipe();
	}

	await db.insert(schema.user).values(users);
	// Single settings row with the defaults; left alone if it already exists.
	await db.insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing();

	// Games + metadata + sidecars + status history. History matters: burn
	// rate reads transitions into `completed`, not the games table.
	let historyN = 0;
	const historyRows: (typeof schema.gameStatusHistory.$inferInsert)[] = [];
	function pushHistory(
		id: string,
		changedBy: string,
		steps: { to: (typeof schema.gameStatus.enumValues)[number]; at: Date }[]
	) {
		let from: (typeof schema.gameStatus.enumValues)[number] | null = null;
		for (const step of steps) {
			historyRows.push({
				id: historyId(++historyN),
				gameId: id,
				fromStatus: from,
				toStatus: step.to,
				changedBy,
				changedAt: step.at,
			});
			from = step.to;
		}
	}

	for (const game of videoGames) {
		const points =
			game.hours && game.difficulty
				? computePoints(game.hours, game.difficulty, undefined, {
						weight: DEFAULT_QUALITY_WEIGHT,
						signals: videoQuality(game.metadata),
					})
				: null;
		const proposedAt = daysAgo((game.startedDaysAgo ?? 10) + 14);
		await db.insert(schema.games).values({
			id: gameId(game.n),
			title: game.title,
			gameType: "video",
			status: game.status,
			proposedBy: game.proposedBy,
			pitch: game.pitch,
			steamAppId: game.steamAppId,
			lengthHours: game.hours?.toFixed(1),
			difficulty: game.difficulty,
			points,
			startedAt: game.startedDaysAgo != null ? daysAgo(game.startedDaysAgo) : null,
			completedAt: game.completedDaysAgo != null ? daysAgo(game.completedDaysAgo) : null,
			createdAt: proposedAt,
		});
		if (game.metadata) {
			await db.insert(schema.gameMetadata).values({
				gameId: gameId(game.n),
				source: "mixed",
				coverUrl: game.steamAppId
					? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.steamAppId}/library_600x900.jpg`
					: null,
				headerUrl: game.steamAppId
					? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.steamAppId}/header.jpg`
					: null,
				genres: game.metadata.genres,
				gameModes: game.metadata.gameModes,
				releaseDate: game.metadata.releaseDate,
				steamReviewScore: game.metadata.steamReviewScore,
				steamReviewCount: game.metadata.steamReviewCount,
				metacriticScore: game.metadata.metacriticScore,
				hltbMain: game.metadata.hltbMain.toFixed(1),
				hltbMainExtra: game.metadata.hltbMainExtra.toFixed(1),
				hltbCompletionist: game.metadata.hltbCompletionist.toFixed(1),
				fetchedAt: proposedAt,
			});
		}

		const steps: { to: (typeof schema.gameStatus.enumValues)[number]; at: Date }[] = [
			{ to: "proposed", at: proposedAt },
		];
		if (game.status !== "proposed") {
			steps.push({ to: "backlog", at: new Date(proposedAt.getTime() + 2 * DAY_MS) });
		}
		if (game.startedDaysAgo != null) {
			steps.push({ to: "playing", at: daysAgo(game.startedDaysAgo) });
		}
		if (game.completedDaysAgo != null) {
			steps.push({ to: "completed", at: daysAgo(game.completedDaysAgo) });
		}
		pushHistory(gameId(game.n), game.proposedBy, steps);
	}

	for (const game of tabletopGames) {
		const hours = tabletopLengthHours(game);
		const points = hours
			? computePoints(hours, game.crunch, undefined, {
					weight: DEFAULT_QUALITY_WEIGHT,
					signals: { bggRating: game.bggRating ?? null },
				})
			: null;
		const proposedAt = daysAgo((game.startedDaysAgo ?? 20) + 14);
		await db.insert(schema.games).values({
			id: gameId(game.n),
			title: game.title,
			gameType: game.gameType,
			status: game.status,
			proposedBy: game.proposedBy,
			pitch: game.pitch,
			lengthHours: hours?.toFixed(1),
			difficulty: game.crunch,
			points,
			startedAt: game.startedDaysAgo != null ? daysAgo(game.startedDaysAgo) : null,
			createdAt: proposedAt,
		});
		await db.insert(schema.tabletopDetails).values({
			gameId: gameId(game.n),
			bggId: game.bggId,
			system: game.system,
			format: game.format,
			platform: game.platform,
			gmUserId: game.gmUserId,
			minPlayers: game.minPlayers,
			maxPlayers: game.maxPlayers,
			lengthBand: game.lengthBand,
			playtimeMinutes: game.playtimeMinutes,
		});
		if (game.bggRating != null) {
			await db.insert(schema.gameMetadata).values({
				gameId: gameId(game.n),
				source: "bgg",
				bggRating: game.bggRating,
				bggWeight: game.bggWeight?.toFixed(1),
				fetchedAt: proposedAt,
			});
		}

		const steps: { to: (typeof schema.gameStatus.enumValues)[number]; at: Date }[] = [
			{ to: "proposed", at: proposedAt },
		];
		if (game.status !== "proposed") {
			steps.push({ to: "backlog", at: new Date(proposedAt.getTime() + 2 * DAY_MS) });
		}
		if (game.startedDaysAgo != null) {
			steps.push({ to: "playing", at: daysAgo(game.startedDaysAgo) });
		}
		pushHistory(gameId(game.n), game.proposedBy, steps);
	}

	await db.insert(schema.gameStatusHistory).values(historyRows);

	// Votes on backlog games — each member within the default budget of 10,
	// max 4 per game. user_id is dedup-only; the UI shows aggregates.
	const ballots: { userId: string; gameN: number; weight: number }[] = [
		{ userId: alex, gameN: 5, weight: 4 },
		{ userId: alex, gameN: 6, weight: 3 },
		{ userId: alex, gameN: 8, weight: 3 },
		{ userId: brooke, gameN: 5, weight: 4 },
		{ userId: brooke, gameN: 7, weight: 4 },
		{ userId: brooke, gameN: 12, weight: 2 },
		{ userId: casey, gameN: 6, weight: 4 },
		{ userId: casey, gameN: 5, weight: 3 },
		{ userId: casey, gameN: 8, weight: 2 },
		{ userId: casey, gameN: 12, weight: 1 },
		{ userId: drew, gameN: 8, weight: 4 },
		{ userId: drew, gameN: 7, weight: 3 },
		{ userId: drew, gameN: 5, weight: 2 },
	];
	await db.insert(schema.votes).values(
		ballots.map((ballot, i) => ({
			id: voteId(i + 1),
			gameId: gameId(ballot.gameN),
			userId: ballot.userId,
			weight: ballot.weight,
		}))
	);
	// Mark already-crossed milestones as notified so the first real vote edit
	// doesn't fire a burst of stale Discord pings.
	const tallies = new Map<number, number>();
	for (const ballot of ballots) {
		tallies.set(ballot.gameN, (tallies.get(ballot.gameN) ?? 0) + ballot.weight);
	}
	const milestoneRows = [...tallies.entries()].flatMap(([gameN, tally]) =>
		[5, 10, 15].filter((m) => tally >= m).map((milestone) => ({ gameId: gameId(gameN), milestone }))
	);
	if (milestoneRows.length > 0) {
		await db.insert(schema.gameVoteMilestones).values(milestoneRows);
	}

	// Tags: shared vocabulary + assignments (names pre-normalized lowercase).
	const tagNames = ["co-op", "story-rich", "cozy", "brutal", "campaign"];
	await db.insert(schema.tags).values(
		tagNames.map((name, i) => ({ id: tagId(i + 1), name, createdBy: alex }))
	);
	const tagN = (name: string) => tagId(tagNames.indexOf(name) + 1);
	await db.insert(schema.gameTags).values([
		{ gameId: gameId(1), tagId: tagN("story-rich"), addedBy: alex },
		{ gameId: gameId(1), tagId: tagN("campaign"), addedBy: alex },
		{ gameId: gameId(4), tagId: tagN("brutal"), addedBy: drew },
		{ gameId: gameId(5), tagId: tagN("story-rich"), addedBy: brooke },
		{ gameId: gameId(6), tagId: tagN("story-rich"), addedBy: alex },
		{ gameId: gameId(7), tagId: tagN("co-op"), addedBy: casey },
		{ gameId: gameId(8), tagId: tagN("brutal"), addedBy: drew },
		{ gameId: gameId(11), tagId: tagN("campaign"), addedBy: alex },
		{ gameId: gameId(12), tagId: tagN("cozy"), addedBy: casey },
	]);

	// Events: one upcoming, one overdue for wrap-up, two completed.
	await db.insert(schema.events).values([
		{
			id: eventId(1),
			title: "Strahd — Session 12",
			gameId: gameId(11),
			scheduledAt: eveningIn(3),
			durationMinutes: 240,
			sessionNumber: 12,
			venue: "hybrid",
			location: "Roll20 + Alex's place",
			notes: "Picking up inside Castle Ravenloft. Bring initiative.",
			createdBy: alex,
		},
		{
			id: eventId(2),
			title: "Board game brunch",
			scheduledAt: daysAgo(1),
			durationMinutes: 180,
			venue: "in_person",
			location: "Casey's kitchen table",
			// Pre-stamped so a locally running cron doesn't immediately nudge
			// Discord about demo data.
			wrapUpNudgeSentAt: new Date(),
			createdBy: casey,
		},
		{
			id: eventId(3),
			title: "Strahd — Session 11",
			gameId: gameId(11),
			scheduledAt: daysAgo(7),
			durationMinutes: 240,
			sessionNumber: 11,
			venue: "hybrid",
			location: "Roll20 + Alex's place",
			status: "completed",
			recap: "The party finally met Strahd at dinner. Nobody died. Yet.",
			howItWent: 5,
			progressNote: "Ended at the gates of Castle Ravenloft.",
			createdBy: alex,
			updatedAt: daysAgo(6),
		},
		{
			id: eventId(4),
			title: "Co-op night: Hades runs",
			gameId: gameId(3),
			scheduledAt: daysAgo(21),
			durationMinutes: 180,
			venue: "virtual",
			location: "Discord voice",
			status: "completed",
			recap: "Beat the final boss on the fourth attempt of the night.",
			howItWent: 4,
			createdBy: brooke,
			updatedAt: daysAgo(20),
		},
	]);
	await db.insert(schema.eventAttendance).values([
		// Upcoming session: RSVPs only.
		{ eventId: eventId(1), userId: alex, rsvp: "yes" },
		{ eventId: eventId(1), userId: brooke, rsvp: "yes" },
		{ eventId: eventId(1), userId: casey, rsvp: "maybe" },
		{ eventId: eventId(1), userId: drew, rsvp: "yes" },
		// Brunch awaiting wrap-up: RSVPs, attendance not yet recorded.
		{ eventId: eventId(2), userId: casey, rsvp: "yes" },
		{ eventId: eventId(2), userId: brooke, rsvp: "yes" },
		{ eventId: eventId(2), userId: drew, rsvp: "no" },
		// Completed sessions: attendance recorded.
		{ eventId: eventId(3), userId: alex, rsvp: "yes", attended: true },
		{ eventId: eventId(3), userId: brooke, rsvp: "yes", attended: true },
		{ eventId: eventId(3), userId: casey, rsvp: "maybe", attended: true },
		{ eventId: eventId(3), userId: drew, rsvp: "yes", attended: false },
		{ eventId: eventId(4), userId: brooke, rsvp: "yes", attended: true },
		{ eventId: eventId(4), userId: casey, rsvp: "yes", attended: true },
	]);

	// An open GRID poll (issue #33): day-windows as options, painted marks.
	await db.insert(schema.availabilityPolls).values({
		id: pollId(2),
		title: "Seat a Wingspan evening",
		kind: "grid",
		gridSessionMinutes: 120,
		createdBy: casey,
		status: "open",
	});
	const gridDay = (n: number) => ({
		start: eveningIn(n, 17),
		end: eveningIn(n, 23),
	});
	const [day1, day2] = [gridDay(5), gridDay(7)];
	await db.insert(schema.availabilityOptions).values([
		{ id: optionId(4), pollId: pollId(2), startsAt: day1.start, endsAt: day1.end },
		{ id: optionId(5), pollId: pollId(2), startsAt: day2.start, endsAt: day2.end },
	]);
	const hoursIn = (day: { start: Date }, from: number, to: number) => ({
		startsAt: new Date(day.start.getTime() + (from - 17) * 60 * 60_000),
		endsAt: new Date(day.start.getTime() + (to - 17) * 60 * 60_000),
	});
	await db.insert(schema.availabilityMarks).values([
		{ pollId: pollId(2), userId: casey, ...hoursIn(day1, 18, 22) },
		{ pollId: pollId(2), userId: brooke, ...hoursIn(day1, 19, 23) },
		{ pollId: pollId(2), userId: alex, ...hoursIn(day1, 20, 22) },
		{ pollId: pollId(2), userId: alex, ...hoursIn(day2, 18, 21) },
		{ pollId: pollId(2), userId: drew, ...hoursIn(day2, 17, 23) },
	]);

	// A legacy slots poll with mixed responses (still rendered).
	await db.insert(schema.availabilityPolls).values({
		id: pollId(1),
		title: "One-shot night for The Quiet Year?",
		createdBy: brooke,
		status: "open",
	});
	await db.insert(schema.availabilityOptions).values([
		{ id: optionId(1), pollId: pollId(1), startsAt: eveningIn(4), endsAt: eveningIn(4, 23) },
		{ id: optionId(2), pollId: pollId(1), startsAt: eveningIn(6), endsAt: eveningIn(6, 23) },
		{ id: optionId(3), pollId: pollId(1), startsAt: eveningIn(8), endsAt: eveningIn(8, 23) },
	]);
	await db.insert(schema.availabilityResponses).values([
		{ optionId: optionId(1), userId: brooke, response: "yes" },
		{ optionId: optionId(2), userId: brooke, response: "yes" },
		{ optionId: optionId(3), userId: brooke, response: "if_need_be" },
		{ optionId: optionId(1), userId: alex, response: "yes" },
		{ optionId: optionId(2), userId: alex, response: "yes" },
		{ optionId: optionId(3), userId: alex, response: "no" },
		{ optionId: optionId(1), userId: casey, response: "if_need_be" },
		{ optionId: optionId(2), userId: casey, response: "yes" },
		{ optionId: optionId(3), userId: casey, response: "no" },
		{ optionId: optionId(1), userId: drew, response: "no" },
		{ optionId: optionId(2), userId: drew, response: "yes" },
		{ optionId: optionId(3), userId: drew, response: "yes" },
	]);

	console.log(
		[
			"Seeded the demo group:",
			`  ${users.length} members (1 pending approval)`,
			`  ${videoGames.length + tabletopGames.length} games across every status (+ metadata, history)`,
			`  ${ballots.length} vote allocations, ${tagNames.length} tags`,
			"  4 events (1 upcoming, 1 needing wrap-up, 2 completed) + 1 open poll",
			"",
			"Demo members can't sign in — sign in with your own Google account",
			"(listed in ADMIN_EMAILS) and it joins alongside them.",
		].join("\n")
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
