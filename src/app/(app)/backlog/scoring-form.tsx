import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { schema } from "@/db";
import { TTRPG_BAND_LABELS } from "@/lib/points";
import { updateGameScoring } from "@/server/games";

type Game = typeof schema.games.$inferSelect;
type Tabletop = typeof schema.tabletopDetails.$inferSelect;

/**
 * Length/difficulty/override editor — the inputs behind the stored effort
 * value (CLAUDE.md #2). Shared by the backlog card's Manage expander and the
 * game detail page (#34). Length is per-type: raw hours for video, band for
 * TTRPGs, minutes for board games — the server derives the stored
 * hour-equivalent (src/lib/points.ts tabletopLengthHours).
 */
export function ScoringForm({
	game,
	tabletop,
	idPrefix = "",
}: {
	game: Game;
	tabletop?: Tabletop | null;
	/** Keeps input ids unique when card and page render the same game. */
	idPrefix?: string;
}) {
	const isTabletop = game.gameType !== "video";
	const id = (name: string) => `${idPrefix}${name}-${game.id}`;

	return (
		<form
			action={updateGameScoring.bind(null, game.id)}
			className="flex flex-wrap items-end gap-3"
		>
			{game.gameType === "video" && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={id("length")} className="text-xs">
						Length (h)
					</Label>
					<Input
						id={id("length")}
						name="lengthHours"
						type="number"
						step="0.1"
						min="0.1"
						defaultValue={game.lengthHours ?? undefined}
						className="h-8 w-24"
					/>
				</div>
			)}
			{game.gameType === "ttrpg" && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={id("length")} className="text-xs">
						Length
					</Label>
					<select
						id={id("length")}
						name="lengthBand"
						defaultValue={tabletop?.lengthBand ?? ""}
						className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-52 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
					>
						<option value="">unset</option>
						{(
							Object.entries(TTRPG_BAND_LABELS) as [keyof typeof TTRPG_BAND_LABELS, string][]
						).map(([band, label]) => (
							<option key={band} value={band}>
								{label}
							</option>
						))}
					</select>
				</div>
			)}
			{game.gameType === "boardgame" && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={id("length")} className="text-xs">
						Playtime (min)
					</Label>
					<Input
						id={id("length")}
						name="playtimeMinutes"
						type="number"
						step="5"
						min="5"
						max="1440"
						defaultValue={tabletop?.playtimeMinutes ?? undefined}
						className="h-8 w-24"
					/>
				</div>
			)}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={id("difficulty")} className="text-xs">
					{isTabletop ? "Crunch" : "Difficulty"}
				</Label>
				<select
					id={id("difficulty")}
					name="difficulty"
					defaultValue={game.difficulty ?? ""}
					className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-32 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
				>
					<option value="">unset</option>
					{isTabletop ? (
						<>
							<option value="1">1 — ultra-light</option>
							<option value="2">2 — light</option>
							<option value="3">3 — medium</option>
							<option value="4">4 — heavy</option>
							<option value="5">5 — very heavy</option>
						</>
					) : (
						<>
							<option value="1">1 — breezy</option>
							<option value="2">2 — casual</option>
							<option value="3">3 — solid</option>
							<option value="4">4 — tough</option>
							<option value="5">5 — brutal</option>
						</>
					)}
				</select>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={id("override")} className="text-xs">
					Effort override
				</Label>
				<Input
					id={id("override")}
					name="pointsOverride"
					type="number"
					min="0"
					defaultValue={game.pointsOverride ?? undefined}
					placeholder="auto"
					className="h-8 w-24"
				/>
			</div>
			<Button size="sm">Save</Button>
		</form>
	);
}
