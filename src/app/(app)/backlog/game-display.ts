import type { schema } from "@/db";

// Shared display vocabulary for the backlog card and the game detail page —
// one source for status/type/transition labels so the two surfaces can't
// drift apart.

type Game = typeof schema.games.$inferSelect;
type Tabletop = typeof schema.tabletopDetails.$inferSelect;
export type GameStatus = Game["status"];

export const GAME_TYPE_LABELS: Record<Exclude<Game["gameType"], "video">, string> = {
	ttrpg: "TTRPG",
	boardgame: "board game",
};

// Short band names for meta rows — the long descriptions live in
// TTRPG_BAND_LABELS (src/lib/points.ts) and are used in the selects.
export const BAND_SHORT: Record<NonNullable<Tabletop["lengthBand"]>, string> = {
	one_shot: "one-shot",
	arc: "arc",
	mini_campaign: "mini-campaign",
	campaign: "campaign",
};

export const FORMAT_LABELS: Record<NonNullable<Tabletop["format"]>, string> = {
	virtual: "virtual",
	in_person: "in person",
	hybrid: "hybrid",
};

export function playersLabel(tabletop: Pick<Tabletop, "minPlayers" | "maxPlayers">): string | null {
	const { minPlayers: min, maxPlayers: max } = tabletop;
	if (min && max) return min === max ? `${min} players` : `${min}–${max} players`;
	if (min) return `${min}+ players`;
	if (max) return `up to ${max} players`;
	return null;
}

/**
 * Per-type length label. Bands/minutes are the display surface for tabletop
 * length — the stored hour-equivalent is internal currency and never shown
 * raw (CLAUDE.md #2 footnote).
 */
export function lengthLabel(
	game: Pick<Game, "gameType" | "lengthHours">,
	tabletop: Pick<Tabletop, "lengthBand" | "playtimeMinutes"> | null | undefined
): string | null {
	if (game.gameType === "ttrpg") {
		return tabletop?.lengthBand ? BAND_SHORT[tabletop.lengthBand] : null;
	}
	if (game.gameType === "boardgame") {
		return tabletop?.playtimeMinutes ? `${tabletop.playtimeMinutes} min` : null;
	}
	return game.lengthHours ? `${Number(game.lengthHours)}h` : null;
}

/** system · format · platform · GM · players — the tabletop info line. */
export function tabletopInfoLine(
	tabletop:
		| Pick<Tabletop, "system" | "format" | "platform" | "minPlayers" | "maxPlayers">
		| null
		| undefined,
	gmName: string | null | undefined
): string | null {
	if (!tabletop) return null;
	const parts = [
		tabletop.system,
		tabletop.format ? FORMAT_LABELS[tabletop.format] : null,
		tabletop.platform,
		gmName ? `GM ${gmName}` : null,
		playersLabel(tabletop),
	].filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : null;
}

export const TRANSITION_LABELS: Partial<
	Record<GameStatus, Partial<Record<GameStatus, string>>>
> = {
	proposed: { playing: "Start playing", backlog: "Add to want-to-play", rejected: "Shelve" },
	backlog: { playing: "Start playing", abandoned: "Shelve" },
	playing: { completed: "Mark finished", backlog: "Pause (back to want-to-play)", abandoned: "Drop it" },
	abandoned: { backlog: "Back to want-to-play" },
	rejected: { proposed: "Suggest again" },
};

export const STATUS_BADGE: Record<
	GameStatus,
	{ label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
	proposed: { label: "suggested", variant: "outline" },
	backlog: { label: "want to play", variant: "secondary" },
	playing: { label: "playing", variant: "default" },
	completed: { label: "played", variant: "secondary" },
	abandoned: { label: "dropped", variant: "outline" },
	rejected: { label: "shelved", variant: "outline" },
};
