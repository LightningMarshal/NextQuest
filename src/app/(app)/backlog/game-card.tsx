import Image from "next/image";
import { RefreshCwIcon, TagIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { schema } from "@/db";
import { refreshGameMetadata, transitionGameStatus, updateGameScoring } from "@/server/games";
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
		<Card className="hover:border-muted-foreground/40 flex h-full flex-col gap-0 overflow-hidden py-0 transition-colors">
			{/* Nova: key-art header with the points badge pinned over a scrim. */}
			<div className="relative h-[140px] w-full shrink-0">
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
				<span className="absolute top-2 left-2">
					<Badge variant={badge.variant}>{badge.label}</Badge>
				</span>
				{/* Effort = stored points (src/lib/points.ts) — burn-rate currency,
				    not a pick ranking. */}
				<span className="stat bg-background/60 absolute top-2 right-2 rounded-md px-2 py-0.5 text-xs font-semibold backdrop-blur">
					{effectivePoints !== null
						? `${effectivePoints} EFFORT${game.pointsOverride !== null ? "*" : ""}`
						: "— EFFORT"}
				</span>
			</div>

			<div className="flex flex-1 flex-col gap-2.5 p-4">
				<h3 className="font-display text-base font-semibold">{game.title}</h3>

				{/* Nova: single mono meta row. */}
				<p className="stat text-muted-foreground text-xs">
					{[
						game.lengthHours ? `${Number(game.lengthHours)}h` : null,
						game.difficulty ? `D${game.difficulty}` : null,
					]
						.filter(Boolean)
						.join(" · ")}
					{metadata?.steamReviewScore != null && (
						<>
							{(game.lengthHours || game.difficulty) && " · "}
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

				{game.pitch ? (
					<p className="line-clamp-2 text-sm italic">&ldquo;{game.pitch}&rdquo;</p>
				) : (
					metadata?.description && (
						<p className="text-muted-foreground line-clamp-2 text-sm">{metadata.description}</p>
					)
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

				{proposerName && (
					<p className="text-muted-foreground text-xs">proposed by {proposerName}</p>
				)}

				{/* All admin/curation controls live behind the expander so the card
				    itself stays a Nova display card. Same server actions as before. */}
				<details className="group mt-auto pt-1">
					<summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
						Manage
					</summary>
					<div className="mt-3 flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-2">
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
							<form action={refreshGameMetadata.bind(null, game.id)} className="flex items-center gap-2">
								<Button size="sm" variant="ghost">
									<RefreshCwIcon className="size-3.5" />
									Refresh metadata
								</Button>
								<span className="text-muted-foreground text-xs">
									re-fetches Steam/HLTB; overwrites fetched fields
								</span>
							</form>
					</div>
				</details>
			</div>
		</Card>
	);
}
