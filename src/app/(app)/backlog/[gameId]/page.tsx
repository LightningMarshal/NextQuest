import type { Metadata as NextMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDb, schema } from "@/db";
import { getVoteTally } from "@/server/votes";

type GameStatus = (typeof schema.gameStatus.enumValues)[number];

const STATUS_BADGE: Record<
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

async function getGameDetail(gameId: string) {
	const db = getDb();
	const [row] = await db
		.select({
			game: schema.games,
			metadata: schema.gameMetadata,
			proposerName: schema.user.name,
		})
		.from(schema.games)
		.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
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
	const row = await getGameDetail(gameId);
	if (!row) notFound();

	const { game, metadata, proposerName } = row;
	const db = getDb();
	const [taggings, tally] = await Promise.all([
		db
			.select({ id: schema.tags.id, name: schema.tags.name })
			.from(schema.gameTags)
			.innerJoin(schema.tags, eq(schema.gameTags.tagId, schema.tags.id))
			.where(eq(schema.gameTags.gameId, gameId))
			.orderBy(asc(schema.tags.name)),
		getVoteTally(),
	]);
	const voteTotal = tally.find((t) => t.gameId === gameId)?.totalWeight ?? 0;

	const badge = STATUS_BADGE[game.status];
	const effectivePoints = game.pointsOverride ?? game.points;
	const art = metadata?.headerUrl ?? metadata?.coverUrl;
	const meta = [
		game.lengthHours ? `${Number(game.lengthHours)}h` : null,
		game.difficulty ? `Difficulty ${game.difficulty}` : null,
		metadata?.steamReviewScore != null ? `${metadata.steamReviewScore}% positive` : null,
		game.status === "backlog" ? `${voteTotal} vote${voteTotal === 1 ? "" : "s"}` : null,
	].filter(Boolean);

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
					<span className="absolute top-3 left-3">
						<Badge variant={badge.variant}>{badge.label}</Badge>
					</span>
					<span className="stat bg-background/60 absolute top-3 right-3 rounded-md px-2.5 py-1 text-sm font-semibold backdrop-blur">
						{effectivePoints !== null
							? `${effectivePoints} PTS${game.pointsOverride !== null ? "*" : ""}`
							: "— PTS"}
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

					{((metadata?.genres?.length ?? 0) > 0 || taggings.length > 0) && (
						<div className="flex flex-wrap items-center gap-1.5">
							{metadata?.genres?.map((genre) => (
								<Badge key={genre} variant="outline" className="text-[10px]">
									{genre}
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
		</div>
	);
}
