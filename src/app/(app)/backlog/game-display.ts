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

export function playersLabel(tabletop: Tabletop): string | null {
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
export function lengthLabel(game: Game, tabletop: Tabletop | null | undefined): string | null {
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
	tabletop: Tabletop | null | undefined,
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
	proposed: { backlog: "Add to backlog", rejected: "Reject" },
	backlog: { playing: "Start playing", abandoned: "Abandon" },
	playing: { completed: "Mark completed", backlog: "Back to backlog", abandoned: "Abandon" },
	abandoned: { backlog: "Back to backlog" },
	rejected: { proposed: "Re-propose" },
};

export const STATUS_BADGE: Record<
	GameStatus,
	{ label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
	proposed: { label: "proposed", variant: "outline" },
	backlog: { label: "backlog", variant: "secondary" },
	playing: { label: "playing", variant: "default" },
	completed: { label: "completed", variant: "secondary" },
	abandoned: { label: "abandoned", variant: "outline" },
	rejected: { label: "rejected", variant: "destructive" },
};
