import Image from "next/image";
import { ClockIcon, GaugeIcon, StarIcon, TagIcon, VoteIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { schema } from "@/db";
import { transitionGameStatus, updateGameScoring } from "@/server/games";
import { addTagToGame, removeTagFromGame } from "@/server/tags";

type Game = typeof schema.games.$inferSelect;
type Metadata = typeof schema.gameMetadata.$inferSelect;
type GameStatus = Game["status"];

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
	proposerName,
	tags,
	voteTotal,
}: {
	game: Game;
	metadata: Metadata | null;
	proposerName: string | null;
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

	return (
		<Card className="overflow-hidden py-0">
			<div className="flex flex-col sm:flex-row">
				{art && (
					<div className="relative h-32 w-full shrink-0 sm:h-auto sm:w-56">
						<Image
							src={art}
							alt={game.title}
							fill
							className="object-cover"
							sizes="(max-width: 640px) 100vw, 224px"
						/>
					</div>
				)}
				<CardContent className="flex flex-1 flex-col gap-3 px-5 py-4">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-base font-semibold">{game.title}</h3>
						<Badge variant={badge.variant}>{badge.label}</Badge>
						{effectivePoints !== null ? (
							<Badge className="gap-1">
								<StarIcon className="size-3" />
								{effectivePoints} pts{game.pointsOverride !== null && " (override)"}
							</Badge>
						) : (
							<Badge variant="outline">needs scoring</Badge>
						)}
						{voteTotal !== undefined && voteTotal > 0 && (
							<Badge variant="secondary" className="gap-1">
								<VoteIcon className="size-3" />
								{voteTotal} group vote{voteTotal === 1 ? "" : "s"}
							</Badge>
						)}
					</div>

					<div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
						{game.lengthHours && (
							<span className="flex items-center gap-1">
								<ClockIcon className="size-3" />
								{Number(game.lengthHours)} h
							</span>
						)}
						{game.difficulty && (
							<span className="flex items-center gap-1">
								<GaugeIcon className="size-3" />
								difficulty {game.difficulty}/5
							</span>
						)}
						{metadata?.steamReviewScore != null && (
							<span>{metadata.steamReviewScore}% positive on Steam</span>
						)}
						{proposerName && <span>proposed by {proposerName}</span>}
					</div>

					{(metadata?.genres?.length ?? 0) > 0 && (
						<div className="flex flex-wrap gap-1">
							{metadata!.genres!.slice(0, 5).map((genre) => (
								<Badge key={genre} variant="outline" className="text-[10px]">
									{genre}
								</Badge>
							))}
						</div>
					)}

					{tags.length > 0 && (
						<div className="flex flex-wrap items-center gap-1">
							<TagIcon className="text-muted-foreground size-3" />
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

					{game.pitch && <p className="text-sm italic">&ldquo;{game.pitch}&rdquo;</p>}
					{!game.pitch && metadata?.description && (
						<p className="text-muted-foreground line-clamp-2 text-sm">{metadata.description}</p>
					)}

					<div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
						{transitions.map(([toStatus, label]) => (
							<form key={toStatus} action={transitionGameStatus.bind(null, game.id, toStatus)}>
								<Button
									size="sm"
									variant={toStatus === "rejected" || toStatus === "abandoned" ? "ghost" : "outline"}
								>
									{label}
								</Button>
							</form>
						))}
						<form
							action={addTagToGame.bind(null, game.id)}
							className="ml-auto flex items-center gap-1"
						>
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
					</div>

					<details className="group">
						<summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
							Edit scoring
						</summary>
						<form
							action={updateGameScoring.bind(null, game.id)}
							className="mt-3 flex flex-wrap items-end gap-3"
						>
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
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`difficulty-${game.id}`} className="text-xs">
									Difficulty
								</Label>
								<select
									id={`difficulty-${game.id}`}
									name="difficulty"
									defaultValue={game.difficulty ?? ""}
									className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-28 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
								>
									<option value="">unset</option>
									<option value="1">1 — breezy</option>
									<option value="2">2 — casual</option>
									<option value="3">3 — solid</option>
									<option value="4">4 — tough</option>
									<option value="5">5 — brutal</option>
								</select>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`override-${game.id}`} className="text-xs">
									Points override
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
					</details>
				</CardContent>
			</div>
		</Card>
	);
}
