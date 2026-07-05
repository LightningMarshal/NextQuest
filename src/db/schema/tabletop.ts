import { integer, pgEnum, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { games } from "./games";

export const tabletopFormat = pgEnum("tabletop_format", ["virtual", "in_person", "hybrid"]);

// Descriptive length bands for TTRPGs — there is no HowLongToBeat for
// campaigns, so we deliberately ship bands, not false precision. Each band
// maps to a representative hour-equivalent (src/lib/points.ts
// TTRPG_BAND_HOURS) which is what lands in games.length_hours.
export const ttrpgLengthBand = pgEnum("ttrpg_length_band", [
	"one_shot",
	"arc",
	"mini_campaign",
	"campaign",
]);

// 1:1 sidecar for ttrpg/boardgame rows, mirroring the game_metadata
// precedent: tabletop-only attributes never widen the games table. Crunch
// and length deliberately have NO columns here — they reuse games.difficulty
// and games.lengthHours so the points/pick formulas stay unchanged
// (docs/DECISIONS.md).
export const tabletopDetails = pgTable("tabletop_details", {
	gameId: uuid("game_id")
		.primaryKey()
		.references(() => games.id, { onDelete: "cascade" }),
	// BoardGameGeek / RPGGeek thing id (shared id space) — dedup at propose,
	// mirrors games.steamAppId.
	bggId: integer("bgg_id").unique(),
	// Game system, e.g. "D&D 5e", "Delta Green", or a board game's edition.
	// Required for TTRPGs at the action layer; null for board games.
	system: text("system"),
	format: tabletopFormat("format"),
	// Free-text like events.location: "Roll20", "Foundry", "kitchen table" —
	// an enum would fossilize on the first new VTT.
	platform: text("platform"),
	// GM/facilitator; null for GM-less games and board games.
	gmUserId: text("gm_user_id").references(() => user.id, { onDelete: "set null" }),
	minPlayers: smallint("min_players"),
	maxPlayers: smallint("max_players"),
	// TTRPG only; drives the hour-equivalent behind points/pick.
	lengthBand: ttrpgLengthBand("length_band"),
	// Board game only; lengthHours is derived as minutes / 60.
	playtimeMinutes: integer("playtime_minutes"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
