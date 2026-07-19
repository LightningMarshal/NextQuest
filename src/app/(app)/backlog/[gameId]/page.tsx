import type { Metadata as NextMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeftIcon, CalendarIcon, CalendarPlusIcon } from "lucide-react";

import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb, schema } from "@/db";
import { transitionGameStatus } from "@/server/games";
import { requireApprovedUser } from "@/server/session";
import { getVoteTally } from "@/server/votes";

import {
	GAME_TYPE_LABELS,
	STATUS_BADGE,
	TRANSITION_LABELS,
	lengthLabel,
	tabletopInfoLine,
	type GameStatus,
} from "../game-display";
import { ScoringForm } from "../scoring-form";
import { StatTiles, videoStatTiles } from "../stat-tiles";

async function getGameDetail(gameId: string) {
	const db = getDb();
	const gmUser = alias(schema.user, "gm_user");
	const [row] = await db
		.select({
			game: schema.games,
			metadata: schema.gameMetadata,
			tabletop: schema.tabletopDetails,
			gmName: gmUser.name,
			proposerName: schema.user.name,
		})
		.from(schema.games)
		.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
		.leftJoin(schema.tabletopDetails, eq(schema.games.id, schema.tabletopDetails.gameId))
		.leftJoin(gmUser, eq(schema.tabletopDetails.gmUserId, gmUser.id))
		.leftJoin(schema.user, eq(schema.games.proposedBy, schema.user.id))
		.where(eq(schema.games.id, gameId));
	return row ?? null;
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ gameId: string }>;
}): Promise<NextMetadata> {
	const { gameId } = await params;
	const row = await getGameDetail(gameId);
	return { title: row ? row.game.title : "Game" };
}

export default async function GameDetailPage({
	params,
}: {
	params: Promise<{ gameId: string }>;
}) {
	const { gameId } = await params;
	// Layout already gates; the id is for the self-approval hint below.
	const viewer = await requireApprovedUser();
	const row = await getGameDetail(gameId);
	if (!row) notFound();

	const { game, metadata, tabletop, gmName, proposerName } = row;
	const db = getDb();
	const [taggings, tally, linkedEvents] = await Promise.all([
		db
			.select({ id: schema.tags.id, name: schema.tags.name })
			.from(schema.gameTags)
			.innerJoin(schema.tags, eq(schema.gameTags.tagId, schema.tags.id))
			.where(eq(schema.gameTags.gameId, gameId))
			.orderBy(asc(schema.tags.name)),
		getVoteTally(),
		// Session history: every event linked to this game, newest first —
		// the same events.gameId join the campaign strip uses.
		db
			.select({
				id: schema.events.id,
				title: schema.events.title,
				scheduledAt: schema.events.scheduledAt,
				status: schema.events.status,
				recap: schema.events.recap,
				howItWent: schema.events.howItWent,
				progressNote: schema.events.progressNote,
				attendedCount: sql<number>`(
					select count(*)::int from "event_attendance"
					where "event_attendance"."event_id" = "events"."id"
					and "event_attendance"."attended" = true
				)`,
			})
			.from(schema.events)
			.where(eq(schema.events.gameId, gameId))
			.orderBy(desc(schema.events.scheduledAt))
			.limit(20),
	]);
	const voteTotal = tally.find((t) => t.gameId === gameId)?.totalWeight ?? 0;

	const badge = STATUS_BADGE[game.status];
	const isTabletop = game.gameType !== "video";
	const effectivePoints = game.pointsOverride ?? game.points;
	const art = metadata?.headerUrl ?? metadata?.coverUrl;
	const tabletopInfo = tabletopInfoLine(tabletop, gmName);
	const transitions = Object.entries(TRANSITION_LABELS[game.status] ?? {}) as [
		GameStatus,
		string,
	][];
	// Reception/HLTB numbers render as stat tiles below; this line keeps the
	// group's own numbers plus the tabletop-only BGG rating.
	const meta = [
		lengthLabel(game, tabletop),
		game.difficulty ? `${isTabletop ? "Crunch" : "Difficulty"} ${game.difficulty}` : null,
		metadata?.bggRating != null ? `BGG ${Number(metadata.bggRating).toFixed(1)}` : null,
		game.status === "backlog" ? `${voteTotal} vote${voteTotal === 1 ? "" : "s"}` : null,
	].filter(Boolean);

	const sessionsHeld = linkedEvents.filter((event) => event.status === "completed");
	const upcomingSessions = linkedEvents
		.filter((event) => event.status === "scheduled" && event.scheduledAt > new Date())
		.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

	return (
		<div className="flex flex-col gap-6">
			<Link
				href="/backlog"
				className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
			>
				<ArrowLeftIcon className="size-4" />
				Back to backlog
			</Link>

			<Card className="flex flex-col gap-0 overflow-hidden py-0">
				<div className="relative h-[220px] w-full shrink-0 sm:h-[300px]">
					{art ? (
						<Image
							src={art}
							alt={game.title}
							fill
							className="object-cover"
							sizes="(max-width: 1024px) 100vw, 960px"
							priority
						/>
					) : (
						<div className="bg-muted h-full w-full" />
					)}
					<span className="absolute top-3 left-3 flex items-center gap-1">
						{/* Outline badges are transparent — over art they need the same
						    scrim as the type badge (see game-card.tsx). */}
						<Badge
							variant={badge.variant}
							className={badge.variant === "outline" ? "bg-background/60 backdrop-blur" : undefined}
						>
							{badge.label}
						</Badge>
						{isTabletop && (
							<Badge variant="outline" className="bg-background/60 backdrop-blur">
								{GAME_TYPE_LABELS[game.gameType as keyof typeof GAME_TYPE_LABELS]}
							</Badge>
						)}
					</span>
					<span className="stat bg-background/60 absolute top-3 right-3 rounded-md px-2.5 py-1 text-sm font-semibold backdrop-blur">
						{effectivePoints !== null
							? `${effectivePoints} EFFORT${game.pointsOverride !== null ? "*" : ""}`
							: "— EFFORT"}
					</span>
				</div>

				<div className="flex flex-col gap-4 p-6">
					<div className="flex flex-col gap-1">
						<h1 className="font-display text-2xl font-semibold tracking-tight">{game.title}</h1>
						{proposerName && (
							<p className="text-muted-foreground text-sm">
								Proposed by{" "}
								<span className="text-foreground/80 font-medium">{proposerName}</span>
							</p>
						)}
					</div>

					{meta.length > 0 && (
						<p className="stat text-muted-foreground text-sm">{meta.join(" · ")}</p>
					)}

					{/* Decision strip (video only): HLTB times, reception, release year. */}
					{!isTabletop && <StatTiles tiles={videoStatTiles(metadata)} />}

					{tabletopInfo && <p className="text-muted-foreground text-sm">{tabletopInfo}</p>}

					{/* The loop's payoff lives here in the open, not behind an
					    expander: "Mark completed" is a primary button for playing
					    games. transitionGameStatus stays the only status writer. */}
					{(transitions.length > 0 || game.status !== "rejected") && (
						<div className="flex flex-wrap items-center gap-2">
							{/* Issue #34: jump straight to scheduling with this game
							    preselected — the events form reads ?game=. */}
							{game.status !== "rejected" && game.status !== "abandoned" && (
								<Button size="sm" variant="outline" asChild>
									<Link href={`/events?game=${game.id}`}>
										<CalendarPlusIcon className="size-3.5" />
										Plan a session
									</Link>
								</Button>
							)}
							{transitions.map(([toStatus, label]) => {
								if (
									game.status === "proposed" &&
									toStatus === "backlog" &&
									game.proposedBy === viewer.id
								) {
									return (
										<span key={toStatus} className="text-muted-foreground text-xs">
											another member adds it to the backlog
										</span>
									);
								}
								const primary =
									(game.status === "playing" && toStatus === "completed") ||
									(game.status === "backlog" && toStatus === "playing") ||
									(game.status === "proposed" && toStatus === "backlog");
								return (
									<form key={toStatus} action={transitionGameStatus.bind(null, game.id, toStatus)}>
										<Button
											size="sm"
											variant={
												primary
													? "default"
													: toStatus === "rejected" || toStatus === "abandoned"
														? "ghost"
														: "outline"
											}
										>
											{label}
										</Button>
									</form>
								);
							})}
						</div>
					)}

					{game.pitch && (
						<blockquote className="border-primary/40 border-l-2 pl-4 text-base italic">
							&ldquo;{game.pitch}&rdquo;
						</blockquote>
					)}

					{metadata?.description && (
						<div className="flex flex-col gap-1.5">
							<h2 className="text-sm font-medium tracking-wide uppercase">About</h2>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{metadata.description}
							</p>
						</div>
					)}

					{/* Issue #34: effort inputs editable right here, not only from the
					    backlog card's Manage expander. Same action, same recompute
					    rules (stored points, CLAUDE.md #2). */}
					{game.status !== "completed" && game.status !== "abandoned" && (
						<div className="flex flex-col gap-2 border-t pt-4">
							<h2 className="text-sm font-medium tracking-wide uppercase">Effort inputs</h2>
							<ScoringForm game={game} tabletop={tabletop} idPrefix="page-" />
							<p className="text-muted-foreground text-xs">
								Effort recomputes from these on save; an override always wins. Played and
								finished games keep their historical value.
							</p>
						</div>
					)}

					{((metadata?.genres?.length ?? 0) > 0 ||
						(metadata?.gameModes?.length ?? 0) > 0 ||
						taggings.length > 0) && (
						<div className="flex flex-wrap items-center gap-1.5">
							{metadata?.genres?.map((genre) => (
								<Badge key={genre} variant="outline" className="text-[10px]">
									{genre}
								</Badge>
							))}
							{metadata?.gameModes?.map((mode) => (
								<Badge key={mode} variant="outline" className="text-muted-foreground text-[10px]">
									{mode}
								</Badge>
							))}
							{taggings.map((tag) => (
								<Badge key={tag.id} variant="secondary" className="text-[10px]">
									{tag.name}
								</Badge>
							))}
						</div>
					)}
				</div>
			</Card>

			{(sessionsHeld.length > 0 || upcomingSessions.length > 0) && (
				<Card className="flex flex-col gap-3 p-6">
					<h2 className="text-sm font-medium tracking-wide uppercase">
						Sessions
						<span className="stat text-muted-foreground ml-2 font-normal">
							{sessionsHeld.length} held
						</span>
					</h2>
					<ul className="flex flex-col gap-2.5">
						{upcomingSessions.map((event) => (
							<li key={event.id} className="flex items-start gap-2 text-sm">
								<CalendarIcon className="text-primary mt-0.5 size-4 shrink-0" />
								<div>
									<span className="font-medium">{event.title}</span>{" "}
									<span className="text-muted-foreground">
										— <LocalTime date={event.scheduledAt} withWeekday />
									</span>
									<span className="text-primary block text-xs">upcoming</span>
								</div>
							</li>
						))}
						{sessionsHeld.map((event) => (
							<li key={event.id} className="flex items-start gap-2 text-sm">
								<CalendarIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
								<div>
									<span className="font-medium">{event.title}</span>{" "}
									<span className="text-muted-foreground">
										— <LocalTime date={event.scheduledAt} />
										{event.attendedCount > 0 && ` · ${event.attendedCount} showed up`}
										{event.howItWent && ` · went ${event.howItWent}/5`}
									</span>
									{event.recap && (
										<p className="text-muted-foreground text-xs whitespace-pre-line">
											{event.recap}
										</p>
									)}
									{event.progressNote && (
										<p className="text-muted-foreground text-xs whitespace-pre-line">
											<span className="font-medium">Left off:</span> {event.progressNote}
										</p>
									)}
								</div>
							</li>
						))}
					</ul>
				</Card>
			)}
		</div>
	);
}
