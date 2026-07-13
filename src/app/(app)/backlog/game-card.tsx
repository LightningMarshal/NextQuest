import Image from "next/image";
import Link from "next/link";
import { RefreshCwIcon, TagIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalTime } from "@/components/local-time";
import type { schema } from "@/db";
import { TTRPG_BAND_LABELS } from "@/lib/points";
import {
	refreshGameMetadata,
	transitionGameStatus,
	updateGameArtwork,
	updateGameScoring,
} from "@/server/games";
import { addTagToGame, removeTagFromGame } from "@/server/tags";

type Game = typeof schema.games.$inferSelect;
type Metadata = typeof schema.gameMetadata.$inferSelect;
type Tabletop = typeof schema.tabletopDetails.$inferSelect;
type GameStatus = Game["status"];

const GAME_TYPE_LABELS: Record<Exclude<Game["gameType"], "video">, string> = {
	ttrpg: "TTRPG",
	boardgame: "board game",
};

// Short band names for the card meta row — the long descriptions live in
// TTRPG_BAND_LABELS (src/lib/points.ts) and are used in the selects.
const BAND_SHORT: Record<NonNullable<Tabletop["lengthBand"]>, string> = {
	one_shot: "one-shot",
	arc: "arc",
	mini_campaign: "mini-campaign",
	campaign: "campaign",
};

const FORMAT_LABELS: Record<NonNullable<Tabletop["format"]>, string> = {
	virtual: "virtual",
	in_person: "in person",
	hybrid: "hybrid",
};

function playersLabel(tabletop: Tabletop): string | null {
	const { minPlayers: min, maxPlayers: max } = tabletop;
	if (min && max) return min === max ? `${min} players` : `${min}–${max} players`;
	if (min) return `${min}+ players`;
	if (max) return `up to ${max} players`;
	return null;
}

const TRANSITION_LABELS: Partial<Record<GameStatus, Partial<Record<GameStatus, string>>>> = {
	proposed: { backlog: "Add to backlog", rejected: "Reject" },
	backlog: { playing: "Start playing", abandoned: "Abandon" },
	playing: { completed: "Mark completed", backlog: "Back to backlog", abandoned: "Abandon" },
	abandoned: { backlog: "Back to backlog" },
	rejected: { proposed: "Re-propose" },
};

const STATUS_BADGE: Record<GameStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
	proposed: { label: "proposed", variant: "outline" },
	backlog: { label: "backlog", variant: "secondary" },
	playing: { label: "playing", variant: "default" },
	completed: { label: "completed", variant: "secondary" },
	abandoned: { label: "abandoned", variant: "outline" },
	rejected: { label: "rejected", variant: "destructive" },
};

export function GameCard({
	game,
	metadata,
	tabletop,
	gmName,
	sessions,
	proposerName,
	currentUserId,
	tags,
	voteTotal,
}: {
	game: Game;
	metadata: Metadata | null;
	tabletop?: Tabletop | null;
	gmName?: string | null;
	/** Linked events for a playing tabletop game — the campaign strip. */
	sessions?: { held: number; nextAt: Date | null };
	proposerName: string | null;
	/** Viewer id — used to hide "Add to backlog" on their own proposals. */
	currentUserId?: string;
	tags: { id: string; name: string }[];
	/** Aggregate group votes — only passed for backlog-status games. */
	voteTotal?: number;
}) {
	const badge = STATUS_BADGE[game.status];
	const transitions = Object.entries(TRANSITION_LABELS[game.status] ?? {}) as [
		GameStatus,
		string,
	][];
	const effectivePoints = game.pointsOverride ?? game.points;
	const art = metadata?.headerUrl ?? metadata?.coverUrl;
	const isTabletop = game.gameType !== "video";
	// Bands/minutes are the display surface for tabletop length — the stored
	// hour-equivalent is internal currency and never shown raw.
	const lengthLabel =
		game.gameType === "ttrpg"
			? tabletop?.lengthBand
				? BAND_SHORT[tabletop.lengthBand]
				: null
			: game.gameType === "boardgame"
				? tabletop?.playtimeMinutes
					? `${tabletop.playtimeMinutes} min`
					: null
				: game.lengthHours
					? `${Number(game.lengthHours)}h`
					: null;
	const tabletopInfo = tabletop
		? [
				tabletop.system,
				tabletop.format ? FORMAT_LABELS[tabletop.format] : null,
				tabletop.platform,
				gmName ? `GM ${gmName}` : null,
				playersLabel(tabletop),
			]
				.filter(Boolean)
				.join(" · ")
		: null;
	const detailHref = `/backlog/${game.id}`;
	// Full text shown in-card behind a "read more" toggle; the detail page
	// (issue #15) has the untruncated version. Only long text needs the toggle.
	const pitchText = game.pitch ?? metadata?.description ?? null;
	const isPitch = Boolean(game.pitch);
	const pitchExpandable = (pitchText?.length ?? 0) > 140;

	return (
		<Card className="hover:border-muted-foreground/40 flex h-full flex-col gap-0 overflow-hidden py-0 transition-colors">
			{/* Nova: key-art header with the points badge pinned over a scrim.
			    The art links through to the game detail page (issue #15). */}
			<Link
				href={detailHref}
				aria-label={`View ${game.title}`}
				className="focus-visible:ring-ring relative block h-[140px] w-full shrink-0 focus-visible:ring-2 focus-visible:outline-none"
			>
				{art ? (
					<Image
						src={art}
						alt={game.title}
						fill
						className="object-cover"
						sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 340px"
					/>
				) : (
					<div className="bg-muted h-full w-full" />
				)}
				<span className="absolute top-2 left-2 flex items-center gap-1">
					<Badge variant={badge.variant}>{badge.label}</Badge>
					{isTabletop && (
						<Badge variant="outline" className="bg-background/60 backdrop-blur">
							{GAME_TYPE_LABELS[game.gameType as keyof typeof GAME_TYPE_LABELS]}
						</Badge>
					)}
				</span>
				{/* Effort = stored points (src/lib/points.ts) — burn-rate currency,
				    not a pick ranking. */}
				<span className="stat bg-background/60 absolute top-2 right-2 rounded-md px-2 py-0.5 text-xs font-semibold backdrop-blur">
					{effectivePoints !== null
						? `${effectivePoints} EFFORT${game.pointsOverride !== null ? "*" : ""}`
						: "— EFFORT"}
				</span>
			</Link>

			<div className="flex flex-1 flex-col gap-2.5 p-4">
				<h3 className="font-display text-base font-semibold">
					<Link href={detailHref} className="hover:text-primary transition-colors">
						{game.title}
					</Link>
				</h3>

				{/* Nova: single mono meta row. */}
				<p className="stat text-muted-foreground text-xs">
					{[
						lengthLabel,
						game.difficulty ? (isTabletop ? `crunch ${game.difficulty}` : `D${game.difficulty}`) : null,
					]
						.filter(Boolean)
						.join(" · ")}
					{metadata?.steamReviewScore != null && (
						<>
							{(lengthLabel || game.difficulty) && " · "}
							<span className="text-success font-medium">{metadata.steamReviewScore}%</span>
						</>
					)}
					{voteTotal !== undefined && (
						<>
							{" · "}
							<span className="text-foreground">
								{voteTotal} vote{voteTotal === 1 ? "" : "s"}
							</span>
						</>
					)}
				</p>

				{tabletopInfo && <p className="text-muted-foreground text-xs">{tabletopInfo}</p>}

				{/* Campaign strip: session activity for an in-progress tabletop game. */}
				{isTabletop && game.status === "playing" && sessions && (
					<p className="stat text-xs">
						{sessions.held} session{sessions.held === 1 ? "" : "s"} held
						{sessions.nextAt && (
							<span className="text-muted-foreground">
								{" · "}next: <LocalTime date={sessions.nextAt} />
							</span>
						)}
					</p>
				)}

				{pitchText &&
					(pitchExpandable ? (
						// Native "read more": summary stays visible (so the label toggles),
						// and the text un-clamps when the <details> opens. No JS, no dup.
						<details className="group/pitch">
							<summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
								<span
									className={
										isPitch
											? "line-clamp-2 text-sm italic group-open/pitch:line-clamp-none"
											: "text-muted-foreground line-clamp-2 text-sm group-open/pitch:line-clamp-none"
									}
								>
									{isPitch ? `“${pitchText}”` : pitchText}
								</span>
								<span className="text-primary mt-0.5 inline-block text-xs font-medium">
									<span className="group-open/pitch:hidden">Read more</span>
									<span className="hidden group-open/pitch:inline">Show less</span>
								</span>
							</summary>
						</details>
					) : isPitch ? (
						<p className="text-sm italic">&ldquo;{pitchText}&rdquo;</p>
					) : (
						<p className="text-muted-foreground text-sm">{pitchText}</p>
					))}

				{proposerName && (
					<p className="text-muted-foreground text-xs">
						Proposed by <span className="text-foreground/80 font-medium">{proposerName}</span>
					</p>
				)}

				{(tags.length > 0 || (metadata?.genres?.length ?? 0) > 0) && (
					<div className="flex flex-wrap items-center gap-1">
						{metadata?.genres?.slice(0, 3).map((genre) => (
							<Badge key={genre} variant="outline" className="text-[10px]">
								{genre}
							</Badge>
						))}
						{metadata?.gameModes?.map((mode) => (
							<Badge key={mode} variant="outline" className="text-muted-foreground text-[10px]">
								{mode}
							</Badge>
						))}
						{tags.map((tag) => (
							<Badge key={tag.id} variant="secondary" className="gap-0.5 pr-1 text-[10px]">
								{tag.name}
								<form action={removeTagFromGame.bind(null, game.id, tag.id)} className="flex">
									<button
										type="submit"
										aria-label={`Remove tag ${tag.name}`}
										className="hover:text-destructive cursor-pointer"
									>
										<XIcon className="size-3" />
									</button>
								</form>
							</Badge>
						))}
					</div>
				)}

				{/* All admin/curation controls live behind the expander so the card
				    itself stays a Nova display card. Same server actions as before. */}
				<details className="group mt-auto pt-1">
					<summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
						Manage
					</summary>
					<div className="mt-3 flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-2">
							{transitions.map(([toStatus, label]) => {
								// A proposal needs a second — the server enforces this too
								// (transitionGameStatus); hiding the button is a courtesy.
								if (
									game.status === "proposed" &&
									toStatus === "backlog" &&
									currentUserId !== undefined &&
									game.proposedBy === currentUserId
								) {
									return (
										<span key={toStatus} className="text-muted-foreground text-xs">
											another member adds it to the backlog
										</span>
									);
								}
								return (
									<form key={toStatus} action={transitionGameStatus.bind(null, game.id, toStatus)}>
										<Button
											size="sm"
											variant={toStatus === "rejected" || toStatus === "abandoned" ? "ghost" : "outline"}
										>
											{label}
										</Button>
									</form>
								);
							})}
						</div>
						<form action={addTagToGame.bind(null, game.id)} className="flex items-center gap-1">
							<Input
								name="tag"
								required
								maxLength={30}
								placeholder="add tag"
								aria-label={`Add tag to ${game.title}`}
								className="h-8 w-28 text-xs"
							/>
							<Button size="sm" variant="ghost" aria-label="Add tag">
								<TagIcon className="size-3.5" />
							</Button>
						</form>
						<form
							action={updateGameScoring.bind(null, game.id)}
							className="flex flex-wrap items-end gap-3"
						>
							{/* Length input per type: raw hours for video, band for TTRPGs,
							    minutes for board games — the server derives the stored
							    hour-equivalent (src/lib/points.ts tabletopLengthHours). */}
							{game.gameType === "video" && (
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`length-${game.id}`} className="text-xs">
										Length (h)
									</Label>
									<Input
										id={`length-${game.id}`}
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
									<Label htmlFor={`length-${game.id}`} className="text-xs">
										Length
									</Label>
									<select
										id={`length-${game.id}`}
										name="lengthBand"
										defaultValue={tabletop?.lengthBand ?? ""}
										className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-52 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
									>
										<option value="">unset</option>
										{(
											Object.entries(TTRPG_BAND_LABELS) as [
												keyof typeof TTRPG_BAND_LABELS,
												string,
											][]
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
									<Label htmlFor={`length-${game.id}`} className="text-xs">
										Playtime (min)
									</Label>
									<Input
										id={`length-${game.id}`}
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
								<Label htmlFor={`difficulty-${game.id}`} className="text-xs">
									{isTabletop ? "Crunch" : "Difficulty"}
								</Label>
								<select
									id={`difficulty-${game.id}`}
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
								<Label htmlFor={`override-${game.id}`} className="text-xs">
									Effort override
								</Label>
								<Input
									id={`override-${game.id}`}
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
						{/* No tabletop provider yet — the action rejects non-video rows. */}
						{!isTabletop && (
							<form action={refreshGameMetadata.bind(null, game.id)} className="flex items-center gap-2">
								<Button size="sm" variant="ghost">
									<RefreshCwIcon className="size-3.5" />
									Refresh metadata
								</Button>
								<span className="text-muted-foreground text-xs">
									re-fetches Steam/HLTB; overwrites fetched fields
								</span>
							</form>
						)}
						{/* Issue #14: fix a broken/oversized cover or header image after
						    proposal. Blank a field to clear it. */}
						<form
							action={updateGameArtwork.bind(null, game.id)}
							className="flex flex-col gap-2"
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`cover-${game.id}`} className="text-xs">
									Cover image URL
								</Label>
								<Input
									id={`cover-${game.id}`}
									name="coverUrl"
									type="url"
									inputMode="url"
									defaultValue={metadata?.coverUrl ?? ""}
									placeholder="https://…"
									className="h-8 text-xs"
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`header-${game.id}`} className="text-xs">
									Header image URL
								</Label>
								<Input
									id={`header-${game.id}`}
									name="headerUrl"
									type="url"
									inputMode="url"
									defaultValue={metadata?.headerUrl ?? ""}
									placeholder="https://…"
									className="h-8 text-xs"
								/>
							</div>
							<Button size="sm" className="self-start">
								Save artwork
							</Button>
						</form>
					</div>
				</details>
			</div>
		</Card>
	);
}
