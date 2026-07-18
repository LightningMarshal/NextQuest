import type { schema } from "@/db";
import { cn } from "@/lib/utils";

// Decision strip for video-game cards and the detail page: the numbers a
// member actually weighs before voting — how long (HLTB), how well-received
// (Steam %, Metacritic), how old — as compact Nova stat tiles. Tabletop rows
// have their own vocabulary (tabletopInfoLine / bggRating) and skip this.

type Metadata = typeof schema.gameMetadata.$inferSelect;

export type StatTile = {
	label: string;
	value: string;
	tone?: "success";
};

/** numeric columns arrive as strings; render "26.5h" / "27h", never "27.0h". */
function hoursValue(value: string | null): string | null {
	if (!value) return null;
	const hours = Number(value);
	if (!Number.isFinite(hours) || hours <= 0) return null;
	return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function compactCount(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}k`;
	return String(count);
}

export function videoStatTiles(metadata: Metadata | null): StatTile[] {
	if (!metadata) return [];
	const tiles: StatTile[] = [];

	// HLTB's three buckets under their community names, abbreviated.
	const story = hoursValue(metadata.hltbMain);
	const storyExtras = hoursValue(metadata.hltbMainExtra);
	const completionist = hoursValue(metadata.hltbCompletionist);
	if (story) tiles.push({ label: "story", value: story });
	if (storyExtras) tiles.push({ label: "story+", value: storyExtras });
	if (completionist) tiles.push({ label: "100%", value: completionist });

	if (metadata.steamReviewScore != null) {
		tiles.push({
			label:
				metadata.steamReviewCount != null
					? `${compactCount(metadata.steamReviewCount)} reviews`
					: "steam",
			value: `${metadata.steamReviewScore}%`,
			tone: metadata.steamReviewScore >= 80 ? "success" : undefined,
		});
	}
	if (metadata.metacriticScore != null) {
		tiles.push({
			label: "metacritic",
			value: String(metadata.metacriticScore),
			tone: metadata.metacriticScore >= 80 ? "success" : undefined,
		});
	}
	// date columns arrive as "YYYY-MM-DD" strings — the year is the signal.
	if (metadata.releaseDate) tiles.push({ label: "released", value: metadata.releaseDate.slice(0, 4) });

	return tiles;
}

export function StatTiles({ tiles, className }: { tiles: StatTile[]; className?: string }) {
	if (tiles.length === 0) return null;
	return (
		<div className={cn("flex flex-wrap gap-1.5", className)}>
			{tiles.map((tile) => (
				<div
					key={tile.label}
					className="bg-muted/50 flex min-w-14 flex-col items-center rounded-md px-2 py-1"
				>
					<span
						className={cn(
							"stat text-sm leading-tight font-semibold",
							tile.tone === "success" && "text-success"
						)}
					>
						{tile.value}
					</span>
					<span className="text-muted-foreground text-[10px] leading-tight tracking-wide uppercase">
						{tile.label}
					</span>
				</div>
			))}
		</div>
	);
}
