import Link from "next/link";
import { CalendarIcon, CalendarPlusIcon, HistoryIcon } from "lucide-react";

import { Avatar } from "@/components/avatar";
import { GameArt } from "@/components/game-art";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { averageRating } from "@/lib/ratings";
import type { LibraryGame } from "@/server/library-read";

import { GAME_TYPE_LABELS, STATUS_BADGE, lengthLabel, tabletopInfoLine } from "./game-display";
import { KeenButton } from "./keen-button";
import { StatTiles, videoStatTiles } from "./stat-tiles";

/**
 * A library card: enough to decide "do I want to play this?" — art, genres,
 * play time and reception, the description, who would play it — plus the
 * two everyday actions ("I'd play this", post a session). Editing lives on the game
 * page; cards no longer carry hidden forms (they made /backlog ~640 KB).
 */
export function GameCard({ game, viewerId }: { game: LibraryGame; viewerId: string }) {
	const badge = STATUS_BADGE[game.status];
	const isTabletop = game.gameType !== "video";
	const detailHref = `/backlog/${game.id}`;
	const length = lengthLabel(game, game.tabletop);
	const tabletopInfo = tabletopInfoLine(game.tabletop, game.tabletop?.gmName);
	const groupRating = averageRating(game.memberRatings);
	const iAmKeen = game.keen.some((entry) => entry.userId === viewerId);
	const blurb = game.pitch ?? game.description;
	const active = game.status === "proposed" || game.status === "backlog" || game.status === "playing";

	return (
		<Card className="flex h-full flex-col gap-0 overflow-hidden py-0">
			<Link href={detailHref} aria-label={`View ${game.title}`} className="relative block h-[140px] w-full shrink-0">
				{game.art ? (
					<GameArt src={game.art} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 340px" />
				) : (
					<div className="bg-muted h-full w-full" />
				)}
				<span className="absolute top-2 left-2 flex items-center gap-1">
					<Badge variant={badge.variant} className="bg-background/70 text-foreground backdrop-blur">
						{badge.label}
					</Badge>
					{isTabletop && (
						<Badge variant="outline" className="bg-background/70 backdrop-blur">
							{GAME_TYPE_LABELS[game.gameType as keyof typeof GAME_TYPE_LABELS]}
						</Badge>
					)}
				</span>
			</Link>

			<div className="flex flex-1 flex-col gap-2.5 p-4">
				<div>
					<h3 className="font-display text-base font-semibold">
						<Link href={detailHref} className="hover:text-primary">
							{game.title}
						</Link>
					</h3>
					<p className="stat text-muted-foreground text-xs">
						{[
							length,
							game.difficulty ? `${isTabletop ? "crunch" : "difficulty"} ${game.difficulty}/5` : null,
							game.bggRating != null ? `BGG ${(game.bggRating / 10).toFixed(1)}` : null,
							groupRating !== null ? `group ${groupRating}/5` : null,
						]
							.filter(Boolean)
							.join(" · ")}
					</p>
				</div>

				{!isTabletop && <StatTiles tiles={videoStatTiles(game)} />}
				{tabletopInfo && <p className="text-muted-foreground text-xs">{tabletopInfo}</p>}

				{((game.genres?.length ?? 0) > 0 || (game.gameModes?.length ?? 0) > 0 || game.tags.length > 0) && (
					<div className="flex flex-wrap gap-1">
						{game.genres?.slice(0, 4).map((genre) => (
							<Badge key={genre} variant="outline" className="text-[10px]">
								{genre}
							</Badge>
						))}
						{game.gameModes?.map((mode) => (
							<Badge key={mode} variant="outline" className="text-muted-foreground text-[10px]">
								{mode}
							</Badge>
						))}
						{game.tags.map((tag) => (
							<Badge key={tag.id} variant="secondary" className="text-[10px]">
								{tag.name}
							</Badge>
						))}
					</div>
				)}

				{blurb && (
					<details className="group/blurb">
						<summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
							<span className={game.pitch ? "line-clamp-3 text-sm italic group-open/blurb:line-clamp-none" : "text-muted-foreground line-clamp-3 text-sm group-open/blurb:line-clamp-none"}>
								{game.pitch ? `“${blurb}”` : blurb}
							</span>
							{blurb.length > 160 && (
								<span className="text-primary mt-0.5 inline-block text-xs font-medium">
									<span className="group-open/blurb:hidden">Read more</span>
									<span className="hidden group-open/blurb:inline">Show less</span>
								</span>
							)}
						</summary>
					</details>
				)}

				{game.nextSession ? (
					<Link href={`/s/${game.nextSession.id}`} className="text-primary flex items-center gap-1 text-xs font-medium">
						<CalendarIcon className="size-3" />
						Next session <LocalTime date={game.nextSession.scheduledAt} withWeekday />
					</Link>
				) : game.sessionsHeld > 0 ? (
					<p className="text-muted-foreground flex items-center gap-1 text-xs">
						<HistoryIcon className="size-3" />
						played {game.sessionsHeld} session{game.sessionsHeld === 1 ? "" : "s"}
					</p>
				) : null}

				<div className="mt-auto flex flex-col gap-2 pt-1">
					{game.keen.length > 0 && (
						<div className="flex items-center gap-2">
							<div className="flex -space-x-2">
								{game.keen.slice(0, 5).map((entry) => (
									<Avatar key={entry.userId} name={entry.name} image={entry.image} className="size-6" />
								))}
							</div>
							<span className="text-muted-foreground truncate text-xs">
								{game.keen.map((entry) => entry.name.split(" ")[0]).join(", ")} would play this
							</span>
						</div>
					)}
					{active && (
						<div className="flex flex-wrap items-center gap-2">
							<KeenButton gameId={game.id} keen={iAmKeen} />
							<Button size="sm" variant="outline" asChild>
								<Link href={`/sessions/new?game=${game.id}`}>
									<CalendarPlusIcon />
									Post session
								</Link>
							</Button>
						</div>
					)}
				</div>
			</div>
		</Card>
	);
}
