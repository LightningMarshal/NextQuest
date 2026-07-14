import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { Badge } from "@/components/ui/badge";
import { getDb, schema } from "@/db";
import { requireApprovedUser } from "@/server/session";
import { getVoteTally } from "@/server/votes";
import { cn } from "@/lib/utils";

import { GameCard } from "./game-card";
import { ProposeForm } from "./propose-form";

export const metadata: Metadata = { title: "Backlog" };

const SECTIONS: { status: (typeof schema.gameStatus.enumValues)[number]; heading: string }[] = [
	{ status: "playing", heading: "Now playing" },
	{ status: "backlog", heading: "Backlog" },
	{ status: "proposed", heading: "Proposed" },
	{ status: "completed", heading: "Completed" },
	{ status: "abandoned", heading: "Abandoned" },
	{ status: "rejected", heading: "Rejected" },
];

const SORTS = [
	{ value: "votes", label: "Most votes" },
	{ value: "shortest", label: "Shortest" },
	{ value: "newest", label: "Newest" },
] as const;
type SortValue = (typeof SORTS)[number]["value"];

type GameType = (typeof schema.gameType.enumValues)[number];
const TYPE_CHIPS: { value: GameType; label: string }[] = [
	{ value: "video", label: "Video" },
	{ value: "boardgame", label: "Board game" },
	{ value: "ttrpg", label: "TTRPG" },
];

export default async function BacklogPage({
	searchParams,
}: {
	searchParams: Promise<{
		tag?: string;
		sort?: string;
		type?: string;
		genre?: string;
		mode?: string;
	}>;
}) {
	const { tag: activeTag, sort, type, genre: activeGenre, mode: activeMode } = await searchParams;
	const activeSort: SortValue = SORTS.some((s) => s.value === sort)
		? (sort as SortValue)
		: "votes";
	const activeType: GameType | undefined = (
		schema.gameType.enumValues as readonly string[]
	).includes(type ?? "")
		? (type as GameType)
		: undefined;
	// The (app) layout already gates; this call is just for the viewer's id
	// (used to hide "Add to backlog" on their own proposals).
	const viewer = await requireApprovedUser();
	const db = getDb();
	// games.proposedBy already joins user; the GM ref needs its own alias.
	const gmUser = alias(schema.user, "gm_user");
	const [allRows, tally, taggings, gameEvents] = await Promise.all([
		db
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
			.orderBy(desc(schema.games.createdAt)),
		getVoteTally(),
		db
			.select({
				gameId: schema.gameTags.gameId,
				tagId: schema.tags.id,
				tagName: schema.tags.name,
			})
			.from(schema.gameTags)
			.innerJoin(schema.tags, eq(schema.gameTags.tagId, schema.tags.id))
			.orderBy(asc(schema.tags.name)),
		// Feeds the campaign strip on playing tabletop cards ("N sessions held ·
		// next: …"). Friend-group scale: aggregate in JS, one small query.
		db
			.select({
				gameId: schema.events.gameId,
				status: schema.events.status,
				scheduledAt: schema.events.scheduledAt,
			})
			.from(schema.events)
			.where(isNotNull(schema.events.gameId)),
	]);
	const tallyByGame = new Map(tally.map((entry) => [entry.gameId, entry.totalWeight]));

	const now = new Date();
	const sessionsByGame = new Map<string, { held: number; nextAt: Date | null }>();
	for (const event of gameEvents) {
		if (!event.gameId) continue;
		const entry = sessionsByGame.get(event.gameId) ?? { held: 0, nextAt: null };
		if (event.status === "completed") entry.held += 1;
		if (
			event.status === "scheduled" &&
			event.scheduledAt > now &&
			(!entry.nextAt || event.scheduledAt < entry.nextAt)
		) {
			entry.nextAt = event.scheduledAt;
		}
		sessionsByGame.set(event.gameId, entry);
	}

	const tagsByGame = new Map<string, { id: string; name: string }[]>();
	for (const { gameId, tagId, tagName } of taggings) {
		const list = tagsByGame.get(gameId) ?? [];
		list.push({ id: tagId, name: tagName });
		tagsByGame.set(gameId, list);
	}
	const allTags = [...new Set(taggings.map((t) => t.tagName))].sort();
	// Browse vocabulary comes from the library itself — the genre/mode chips
	// only offer values that at least one game carries.
	const allGenres = [...new Set(allRows.flatMap((row) => row.metadata?.genres ?? []))].sort();
	const allModes = [...new Set(allRows.flatMap((row) => row.metadata?.gameModes ?? []))].sort();

	// Filters intersect: type ∧ genre ∧ mode ∧ tag.
	const rows = allRows.filter(
		(row) =>
			(!activeType || row.game.gameType === activeType) &&
			(!activeGenre || (row.metadata?.genres ?? []).includes(activeGenre)) &&
			(!activeMode || ((row.metadata?.gameModes ?? []) as string[]).includes(activeMode)) &&
			(!activeTag || (tagsByGame.get(row.game.id) ?? []).some((tag) => tag.name === activeTag))
	);
	const anyFilterActive = Boolean(activeTag || activeType || activeGenre || activeMode);

	// Every control preserves the others; defaults are dropped from the URL.
	const buildHref = (
		overrides: Partial<{
			tag: string | undefined;
			sort: SortValue;
			type: string | undefined;
			genre: string | undefined;
			mode: string | undefined;
		}>
	) => {
		const next = {
			tag: activeTag,
			sort: activeSort,
			type: activeType as string | undefined,
			genre: activeGenre,
			mode: activeMode,
			...overrides,
		};
		const params = new URLSearchParams();
		if (next.tag) params.set("tag", next.tag);
		if (next.sort !== "votes") params.set("sort", next.sort);
		if (next.type) params.set("type", next.type);
		if (next.genre) params.set("genre", next.genre);
		if (next.mode) params.set("mode", next.mode);
		const query = params.toString();
		return query ? `/backlog?${query}` : "/backlog";
	};

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-display text-3xl font-semibold tracking-tight">Backlog</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Everything the group plans to play, is playing, or has finished.
					</p>
				</div>
				{/* Nova: segmented sort control — applies to the backlog section. */}
				<div className="border-border bg-card flex items-center gap-0.5 rounded-lg border p-0.5 text-xs">
					{SORTS.map(({ value, label }) => (
						<Link
							key={value}
							href={buildHref({ sort: value })}
							className={cn(
								"rounded-md px-2.5 py-1 font-medium transition-colors",
								value === activeSort
									? "bg-primary/12 text-primary"
									: "text-muted-foreground hover:text-foreground"
							)}
						>
							{label}
						</Link>
					))}
				</div>
			</div>

			<ProposeForm />

			{/* Browse filters — each row is one dimension; they intersect. Chips
			    only exist for values the library actually has. */}
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-muted-foreground mr-1 w-12 text-xs tracking-wide uppercase">
						Type
					</span>
					<Link href={buildHref({ type: undefined })}>
						<Badge variant={activeType ? "outline" : "default"}>all</Badge>
					</Link>
					{TYPE_CHIPS.map(({ value, label }) => (
						<Link key={value} href={buildHref({ type: value })}>
							<Badge
								variant={value === activeType ? "default" : "outline"}
								className={cn(value !== activeType && "hover:bg-accent")}
							>
								{label}
							</Badge>
						</Link>
					))}
				</div>
				{allGenres.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-muted-foreground mr-1 w-12 text-xs tracking-wide uppercase">
							Genre
						</span>
						<Link href={buildHref({ genre: undefined })}>
							<Badge variant={activeGenre ? "outline" : "default"}>all</Badge>
						</Link>
						{allGenres.map((genre) => (
							<Link key={genre} href={buildHref({ genre })}>
								<Badge
									variant={genre === activeGenre ? "default" : "outline"}
									className={cn(genre !== activeGenre && "hover:bg-accent")}
								>
									{genre}
								</Badge>
							</Link>
						))}
					</div>
				)}
				{allModes.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-muted-foreground mr-1 w-12 text-xs tracking-wide uppercase">
							Mode
						</span>
						<Link href={buildHref({ mode: undefined })}>
							<Badge variant={activeMode ? "outline" : "default"}>all</Badge>
						</Link>
						{allModes.map((mode) => (
							<Link key={mode} href={buildHref({ mode })}>
								<Badge
									variant={mode === activeMode ? "default" : "outline"}
									className={cn(mode !== activeMode && "hover:bg-accent")}
								>
									{mode}
								</Badge>
							</Link>
						))}
					</div>
				)}
				{allTags.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-muted-foreground mr-1 w-12 text-xs tracking-wide uppercase">
							Tags
						</span>
						<Link href={buildHref({ tag: undefined })}>
							<Badge variant={activeTag ? "outline" : "default"}>all</Badge>
						</Link>
						{allTags.map((tag) => (
							<Link key={tag} href={buildHref({ tag })}>
								<Badge
									variant={tag === activeTag ? "default" : "outline"}
									className={cn(tag !== activeTag && "hover:bg-accent")}
								>
									{tag}
								</Badge>
							</Link>
						))}
					</div>
				)}
			</div>

			{rows.length === 0 && (
				<p className="text-muted-foreground text-sm">
					{anyFilterActive
						? "No games match the current filters."
						: "Nothing here yet — propose the first game above."}
				</p>
			)}

			{SECTIONS.map(({ status, heading }) => {
				const sectionRows = rows.filter((row) => row.game.status === status);
				if (sectionRows.length === 0) return null;
				if (status === "backlog") {
					// The browse section honors the sort control; "Most votes" is the
					// group priority order — what voting is for. Rows arrive newest-first,
					// so "newest" needs no re-sort.
					if (activeSort === "votes") {
						sectionRows.sort(
							(a, b) =>
								(tallyByGame.get(b.game.id) ?? 0) - (tallyByGame.get(a.game.id) ?? 0)
						);
					} else if (activeSort === "shortest") {
						sectionRows.sort(
							(a, b) =>
								(a.game.lengthHours ? Number(a.game.lengthHours) : Infinity) -
								(b.game.lengthHours ? Number(b.game.lengthHours) : Infinity)
						);
					}
				}
				return (
					<section key={status} className="flex flex-col gap-3">
						<h2 className="text-sm font-medium tracking-wide uppercase">
							{heading}
							<span className="stat text-muted-foreground ml-2 font-normal">
								{sectionRows.length}
							</span>
						</h2>
						{/* Nova: 3-column card grid. */}
						<div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{sectionRows.map((row) => (
								<GameCard
									key={row.game.id}
									game={row.game}
									metadata={row.metadata}
									tabletop={row.tabletop}
									gmName={row.gmName}
									sessions={sessionsByGame.get(row.game.id)}
									proposerName={row.proposerName}
									currentUserId={viewer.id}
									tags={tagsByGame.get(row.game.id) ?? []}
									voteTotal={
										status === "backlog" ? (tallyByGame.get(row.game.id) ?? 0) : undefined
									}
								/>
							))}
						</div>
					</section>
				);
			})}
		</div>
	);
}
