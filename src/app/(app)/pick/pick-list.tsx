"use client";

import { useOptimistic, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MinusIcon, PlusIcon, StarIcon, TrophyIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { explainPick, type PickComponent, type PickComponentKey } from "@/lib/pick";
import { setVote } from "@/server/votes";
import { cn } from "@/lib/utils";

export type PickListGame = {
	id: string;
	title: string;
	gameType: "video" | "ttrpg" | "boardgame";
	system: string | null;
	art: string | null;
	/** Stored points (override wins) — the burn-rate effort currency. */
	effort: number | null;
	lengthHours: number | null;
	gameModes: string[] | null;
	playerRange: { min: number | null; max: number | null } | null;
	backlogSince: Date | null;
	/** Group aggregate including the caller's own allocation. */
	groupTotal: number;
	/** The caller's own allocation. */
	mine: number;
	/** Composite pick score, 0–100 — computed server-side from aggregates. */
	score: number;
	components: PickComponent[];
};

const TYPE_BADGES: Record<PickListGame["gameType"], string | null> = {
	video: null,
	ttrpg: "TTRPG",
	boardgame: "board game",
};

/** Meta-row line about a game's length — never raw hours for a TTRPG. */
function lengthLine(game: PickListGame): string | null {
	if (game.gameType === "ttrpg") return game.system;
	if (game.gameType === "boardgame") {
		return game.lengthHours !== null ? `${Math.round(game.lengthHours * 60)} min` : null;
	}
	return game.lengthHours !== null ? `${game.lengthHours}h` : null;
}

function playerLine(game: PickListGame): string | null {
	const range = game.playerRange;
	if (!range || (range.min === null && range.max === null)) return null;
	if (range.min !== null && range.max !== null) {
		return range.min === range.max ? `${range.min} players` : `${range.min}–${range.max} players`;
	}
	return range.min !== null ? `${range.min}+ players` : `up to ${range.max} players`;
}

const COMPONENT_LABELS: Record<PickComponentKey, string> = {
	interest: "group interest",
	quality: "acclaim",
	timeFit: "time fit",
	staleness: "shelf time",
	partyFit: "party fit",
};

/** "Why this?" line — the shared pure explainer (src/lib/pick.ts, tested). */
function explanation(game: PickListGame, hasSessionHours: boolean): string {
	return explainPick({
		components: game.components,
		tally: game.groupTotal,
		backlogSince: game.backlogSince ? new Date(game.backlogSince) : null,
		gameType: game.gameType,
		hasSessionHours,
	});
}

function ComponentBars({ game, compact }: { game: PickListGame; compact?: boolean }) {
	return (
		<div className={cn("flex flex-col gap-1", compact ? "max-w-56" : "max-w-72")}>
			{game.components.map((component) => (
				<div
					key={component.key}
					className="flex items-center gap-2"
					title={`${COMPONENT_LABELS[component.key]}: ${Math.round(component.value * 100)}% × weight ${Math.round(component.weight * 100)}%`}
				>
					<span className="text-muted-foreground w-24 shrink-0 text-[10px] uppercase tracking-wide">
						{COMPONENT_LABELS[component.key]}
					</span>
					<div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
						<div
							className="bg-gradient-to-r from-primary to-chart-2 h-full rounded-full"
							style={{ width: `${Math.round(component.value * 100)}%` }}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

function VoteSteppers({
	game,
	mine,
	maxPerGame,
	remaining,
	adjust,
}: {
	game: PickListGame;
	mine: number;
	maxPerGame: number;
	remaining: number;
	adjust: (gameId: string, delta: number) => void;
}) {
	return (
		<div className="flex shrink-0 items-center gap-2">
			<Button
				size="icon"
				variant="secondary"
				className="size-8 rounded-md"
				aria-label={`Remove a point from ${game.title}`}
				disabled={mine === 0}
				onClick={() => adjust(game.id, -1)}
			>
				<MinusIcon />
			</Button>
			<span
				className={cn(
					"stat w-6 text-center text-sm font-semibold",
					mine === 0 && "text-muted-foreground"
				)}
			>
				{mine}
			</span>
			<Button
				size="icon"
				className="size-8 rounded-md"
				aria-label={`Add a point to ${game.title}`}
				disabled={mine >= maxPerGame || remaining <= 0}
				onClick={() => adjust(game.id, 1)}
			>
				<PlusIcon />
			</Button>
		</div>
	);
}

export function PickList({
	games,
	budget,
	maxPerGame,
	hasSessionHours,
}: {
	games: PickListGame[];
	budget: number;
	maxPerGame: number;
	hasSessionHours: boolean;
}) {
	const router = useRouter();
	const [, startTransition] = useTransition();

	const serverAllocations = Object.fromEntries(games.map((game) => [game.id, game.mine]));
	const [allocations, applyAllocation] = useOptimistic(
		serverAllocations,
		(state, update: { gameId: string; weight: number }) => ({
			...state,
			[update.gameId]: update.weight,
		})
	);

	const spent = Object.values(allocations).reduce((total, weight) => total + weight, 0);
	const remaining = budget - spent;
	const spentPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;

	function adjust(gameId: string, delta: number) {
		const current = allocations[gameId] ?? 0;
		const next = Math.max(0, Math.min(maxPerGame, current + delta));
		if (next === current) return;
		if (delta > 0 && remaining <= 0) return;

		startTransition(async () => {
			applyAllocation({ gameId, weight: next });
			try {
				// The server revalidates /pick, so the ranking reorders on the
				// round-trip — deliberately: the list responding to interest IS the
				// feature. Scores are never recomputed from optimistic local state.
				await setVote(gameId, next);
			} catch {
				// Out of sync (e.g. budget race in another tab) — resync from server.
				router.refresh();
			}
		});
	}

	const [top, ...rest] = games;
	const topMine = allocations[top.id] ?? 0;
	const topGroupTotal = top.groupTotal - top.mine + topMine;

	return (
		<div className="flex flex-col gap-4">
			<Card className="bg-background/80 sticky top-16 z-10 backdrop-blur">
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-medium">Your interest budget</p>
							<p className="text-muted-foreground text-xs">
								Spread up to {budget} points, max {maxPerGame} per game — it feeds the
								&ldquo;group interest&rdquo; part of the ranking. Only totals are ever shown —
								nobody sees your picks.
							</p>
						</div>
						<p className="stat text-2xl font-semibold">
							{spent}
							<span className="text-muted-foreground text-sm font-normal"> / {budget}</span>
						</p>
					</div>
					{/* Nova: cyan → violet meter, fills as the budget is spent. */}
					<div
						className="bg-muted h-2 w-full overflow-hidden rounded-full"
						role="progressbar"
						aria-valuenow={spent}
						aria-valuemin={0}
						aria-valuemax={budget}
						aria-label="Budget spent"
					>
						<div
							className="h-full rounded-full bg-gradient-to-r from-primary to-chart-2 transition-[width] duration-200"
							style={{ width: `${spentPct}%` }}
						/>
					</div>
				</CardContent>
			</Card>

			{/* Tonight's pick: the #1 ranked game gets the spotlight. */}
			<Card className="border-primary/40 overflow-hidden py-0">
				<div className="flex flex-col sm:flex-row">
					{top.art ? (
						<div className="relative h-40 w-full shrink-0 sm:h-auto sm:w-64">
							<Image
								src={top.art}
								alt={top.title}
								fill
								className="object-cover"
								sizes="(max-width: 640px) 100vw, 256px"
							/>
						</div>
					) : (
						<div className="bg-muted h-40 w-full shrink-0 sm:h-auto sm:w-64" />
					)}
					<div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<Badge className="mb-2 gap-1">
									<TrophyIcon className="size-3" />
									Tonight&rsquo;s pick
								</Badge>
								<h2 className="font-display truncate text-xl font-semibold">{top.title}</h2>
								<div className="mt-1 flex flex-wrap items-center gap-2">
									{TYPE_BADGES[top.gameType] && (
										<Badge variant="outline" className="text-[10px]">
											{TYPE_BADGES[top.gameType]}
										</Badge>
									)}
									{top.effort !== null && (
										<Badge variant="secondary" className="gap-1">
											<StarIcon className="size-3" />
											{top.effort} effort
										</Badge>
									)}
									{lengthLine(top) && (
										<span className="stat text-muted-foreground text-xs">{lengthLine(top)}</span>
									)}
									{playerLine(top) && (
										<span className="stat text-muted-foreground text-xs">{playerLine(top)}</span>
									)}
									<span
										className={cn(
											"text-xs",
											topGroupTotal > 0 ? "text-primary" : "text-muted-foreground"
										)}
									>
										<span className="stat">{topGroupTotal}</span> group vote
										{topGroupTotal === 1 ? "" : "s"}
									</span>
								</div>
								{explanation(top, hasSessionHours) && (
									<p className="text-muted-foreground mt-2 text-sm">
										{explanation(top, hasSessionHours)}
									</p>
								)}
							</div>
							<div className="shrink-0 text-right">
								<p className="stat text-3xl font-semibold">{top.score}</p>
								<p className="text-muted-foreground text-[10px] uppercase tracking-wide">score</p>
							</div>
						</div>
						<ComponentBars game={top} />
						<div className="mt-auto flex items-center justify-between gap-3 pt-1">
							<span className="text-muted-foreground text-xs">Your interest</span>
							<VoteSteppers
								game={top}
								mine={topMine}
								maxPerGame={maxPerGame}
								remaining={remaining}
								adjust={adjust}
							/>
						</div>
					</div>
				</div>
			</Card>

			<div className="flex flex-col gap-3">
				{rest.map((game, index) => {
					const mine = allocations[game.id] ?? 0;
					const groupTotal = game.groupTotal - game.mine + mine;
					const why = explanation(game, hasSessionHours);
					return (
						<Card key={game.id} className="overflow-hidden py-0">
							<div className="flex items-center gap-4 pr-5">
								<span className="stat text-muted-foreground w-8 shrink-0 text-center text-sm">
									{index + 2}
								</span>
								{game.art ? (
									<div className="relative h-20 w-36 shrink-0">
										<Image
											src={game.art}
											alt={game.title}
											fill
											className="object-cover"
											sizes="144px"
										/>
									</div>
								) : (
									<div className="bg-muted h-20 w-36 shrink-0" />
								)}
								<div className="min-w-0 flex-1 py-3">
									<div className="flex items-center gap-2">
										<p className="truncate text-sm font-semibold">{game.title}</p>
										<span className="stat text-primary shrink-0 text-sm font-semibold">
											{game.score}
										</span>
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-2">
										{TYPE_BADGES[game.gameType] && (
											<Badge variant="outline" className="text-[10px]">
												{TYPE_BADGES[game.gameType]}
											</Badge>
										)}
										{game.effort !== null && (
											<Badge variant="secondary" className="gap-1 text-[10px]">
												<StarIcon className="size-3" />
												{game.effort} effort
											</Badge>
										)}
										{lengthLine(game) && (
											<span className="stat text-muted-foreground text-xs">
												{lengthLine(game)}
											</span>
										)}
										{playerLine(game) && (
											<span className="stat text-muted-foreground text-xs">
												{playerLine(game)}
											</span>
										)}
										<span
											className={cn(
												"text-xs",
												groupTotal > 0 ? "text-primary" : "text-muted-foreground"
											)}
										>
											<span className="stat">{groupTotal}</span> group vote
											{groupTotal === 1 ? "" : "s"}
										</span>
									</div>
									{why && <p className="text-muted-foreground mt-1 truncate text-xs">{why}</p>}
								</div>
								<VoteSteppers
									game={game}
									mine={mine}
									maxPerGame={maxPerGame}
									remaining={remaining}
									adjust={adjust}
								/>
							</div>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
