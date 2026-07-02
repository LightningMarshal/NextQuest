import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { getDb, schema } from "@/db";
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

export default async function BacklogPage({
	searchParams,
}: {
	searchParams: Promise<{ tag?: string; sort?: string }>;
}) {
	const { tag: activeTag, sort } = await searchParams;
	const activeSort: SortValue = SORTS.some((s) => s.value === sort)
		? (sort as SortValue)
		: "votes";
	const db = getDb();
	const [allRows, tally, taggings] = await Promise.all([
		db
			.select({
				game: schema.games,
				metadata: schema.gameMetadata,
				proposerName: schema.user.name,
			})
			.from(schema.games)
			.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
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
	]);
	const tallyByGame = new Map(tally.map((entry) => [entry.gameId, entry.totalWeight]));

	const tagsByGame = new Map<string, { id: string; name: string }[]>();
	for (const { gameId, tagId, tagName } of taggings) {
		const list = tagsByGame.get(gameId) ?? [];
		list.push({ id: tagId, name: tagName });
		tagsByGame.set(gameId, list);
	}
	const allTags = [...new Set(taggings.map((t) => t.tagName))].sort();

	const rows = activeTag
		? allRows.filter((row) =>
				(tagsByGame.get(row.game.id) ?? []).some((tag) => tag.name === activeTag)
			)
		: allRows;

	// Sort links preserve the active tag filter (and vice versa).
	const sortHref = (value: SortValue) => {
		const params = new URLSearchParams();
		if (activeTag) params.set("tag", activeTag);
		if (value !== "votes") params.set("sort", value);
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
							href={sortHref(value)}
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

			{allTags.length > 0 && (
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-muted-foreground mr-1 text-xs uppercase tracking-wide">
						Filter
					</span>
					<Link href={activeSort !== "votes" ? `/backlog?sort=${activeSort}` : "/backlog"}>
						<Badge variant={activeTag ? "outline" : "default"}>all</Badge>
					</Link>
					{allTags.map((tag) => (
						<Link
							key={tag}
							href={`/backlog?tag=${encodeURIComponent(tag)}${activeSort !== "votes" ? `&sort=${activeSort}` : ""}`}
						>
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

			{rows.length === 0 && (
				<p className="text-muted-foreground text-sm">
					{activeTag
						? `No games tagged “${activeTag}”.`
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
									proposerName={row.proposerName}
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
