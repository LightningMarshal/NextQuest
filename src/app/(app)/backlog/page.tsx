import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, SearchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getLibrary, type LibraryGame } from "@/server/library-read";
import { requireMember } from "@/server/session";

import { GameCard } from "./game-card";
import { ProposeForm } from "./propose-form";

export const metadata: Metadata = { title: "Library" };

// The library: every game the group plays, wants to play, or has played —
// rich enough to decide from (genres, description, time-to-beat,
// reception), with "I'm keen" as the group's want-to-play signal. Filters
// compose and live in the URL.

const SECTIONS: { key: string; heading: string; statuses: LibraryGame["status"][]; collapsed?: boolean }[] = [
	{ key: "playing", heading: "Playing now", statuses: ["playing"] },
	{ key: "want", heading: "Want to play", statuses: ["backlog", "proposed"] },
	{ key: "played", heading: "Played", statuses: ["completed"] },
	{ key: "shelved", heading: "Shelved", statuses: ["abandoned", "rejected"], collapsed: true },
];

const SORTS = [
	{ value: "keen", label: "Most keen" },
	{ value: "newest", label: "Newest" },
	{ value: "shortest", label: "Shortest" },
] as const;
type SortValue = (typeof SORTS)[number]["value"];

const TYPE_CHIPS = [
	{ value: "video", label: "Video" },
	{ value: "boardgame", label: "Board game" },
	{ value: "ttrpg", label: "TTRPG" },
] as const;

type Params = { q?: string; tag?: string; sort?: string; type?: string; genre?: string; mode?: string };

function sortGames(games: LibraryGame[], sort: SortValue): LibraryGame[] {
	const copy = [...games];
	if (sort === "keen") copy.sort((a, b) => b.keen.length - a.keen.length || b.createdAt.getTime() - a.createdAt.getTime());
	if (sort === "shortest") copy.sort((a, b) => (Number(a.lengthHours) || Infinity) - (Number(b.lengthHours) || Infinity));
	return copy; // newest: rows arrive newest-first
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Params> }) {
	const viewer = await requireMember("/backlog");
	const params = await searchParams;
	const sort: SortValue = SORTS.some((s) => s.value === params.sort) ? (params.sort as SortValue) : "keen";
	const type = TYPE_CHIPS.some((t) => t.value === params.type) ? params.type : undefined;
	const q = params.q?.trim().slice(0, 100) || undefined;
	const all = await getLibrary();

	const vocabulary = {
		genre: [...new Set(all.flatMap((g) => g.genres ?? []))].sort(),
		mode: [...new Set(all.flatMap((g) => g.gameModes ?? []))].sort(),
		tag: [...new Set(all.flatMap((g) => g.tags.map((t) => t.name)))].sort(),
	};
	const games = all.filter(
		(g) =>
			(!q || g.title.toLowerCase().includes(q.toLowerCase())) &&
			(!type || g.gameType === type) &&
			(!params.genre || (g.genres ?? []).includes(params.genre)) &&
			(!params.mode || (g.gameModes ?? []).includes(params.mode)) &&
			(!params.tag || g.tags.some((t) => t.name === params.tag))
	);
	const filtering = Boolean(q || type || params.genre || params.mode || params.tag);

	// Every control preserves the others; defaults drop out of the URL.
	const href = (overrides: Partial<Params>) => {
		const next = { q, tag: params.tag, sort, type, genre: params.genre, mode: params.mode, ...overrides };
		const search = new URLSearchParams();
		for (const [key, value] of Object.entries(next)) {
			if (value && !(key === "sort" && value === "keen")) search.set(key, value);
		}
		const query = search.toString();
		return query ? `/backlog?${query}` : "/backlog";
	};

	const chipRow = (label: string, key: "type" | "genre" | "mode" | "tag", values: { value: string; label: string }[], active?: string) =>
		values.length > 0 && (
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-muted-foreground mr-1 w-14 text-xs tracking-wide uppercase">{label}</span>
				<Link href={href({ [key]: undefined })}>
					<Badge variant={active ? "outline" : "default"}>all</Badge>
				</Link>
				{values.map((chip) => (
					<Link key={chip.value} href={href({ [key]: chip.value })}>
						<Badge variant={chip.value === active ? "default" : "outline"} className={cn(chip.value !== active && "hover:bg-accent")}>
							{chip.label}
						</Badge>
					</Link>
				))}
			</div>
		);

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-display text-3xl font-semibold tracking-tight">Library</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						What the group plays, wants to play, and has played. Mark what you&apos;re keen on.
					</p>
				</div>
				<div className="border-border bg-card flex items-center gap-0.5 rounded-lg border p-0.5 text-xs">
					{SORTS.map(({ value, label }) => (
						<Link
							key={value}
							href={href({ sort: value })}
							className={cn("rounded-md px-2.5 py-1 font-medium", value === sort ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground")}
						>
							{label}
						</Link>
					))}
				</div>
			</header>

			<details className="group">
				<summary className="border-border hover:border-primary/40 flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
					<PlusIcon className="size-4" />
					Add a game
				</summary>
				<div className="mt-3">
					<ProposeForm />
				</div>
			</details>

			<div className="flex flex-col gap-2">
				<form action="/backlog" className="relative max-w-sm">
					<SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
					<Input name="q" defaultValue={q} placeholder="Search the library" className="pl-8" aria-label="Search the library" />
					{sort !== "keen" && <input type="hidden" name="sort" value={sort} />}
				</form>
				{chipRow("Type", "type", TYPE_CHIPS.map((c) => ({ value: c.value, label: c.label })), type)}
				<details open={Boolean(params.genre || params.mode || params.tag)}>
					<summary className="text-muted-foreground cursor-pointer text-xs select-none">More filters — genre, mode, tags</summary>
					<div className="mt-2 flex flex-col gap-2">
						{chipRow("Genre", "genre", vocabulary.genre.map((v) => ({ value: v, label: v })), params.genre)}
						{chipRow("Mode", "mode", vocabulary.mode.map((v) => ({ value: v, label: v })), params.mode)}
						{chipRow("Tags", "tag", vocabulary.tag.map((v) => ({ value: v, label: v })), params.tag)}
					</div>
				</details>
			</div>

			{games.length === 0 && (
				<p className="text-muted-foreground text-sm">
					{filtering ? "No games match these filters." : "Nothing here yet — add the first game above."}
				</p>
			)}

			{SECTIONS.map((section) => {
				const rows = sortGames(games.filter((g) => section.statuses.includes(g.status)), sort);
				if (rows.length === 0) return null;
				const grid = (
					<div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{rows.map((game) => (
							<GameCard key={game.id} game={game} viewerId={viewer.id} />
						))}
					</div>
				);
				const heading = (
					<>
						{section.heading}
						<span className="stat text-muted-foreground ml-2 font-normal">{rows.length}</span>
					</>
				);
				return section.collapsed && !filtering ? (
					<details key={section.key} className="flex flex-col gap-3">
						<summary className="cursor-pointer text-sm font-medium tracking-wide uppercase select-none">{heading}</summary>
						<div className="mt-3">{grid}</div>
					</details>
				) : (
					<section key={section.key} className="flex flex-col gap-3">
						<h2 className="text-sm font-medium tracking-wide uppercase">{heading}</h2>
						{grid}
					</section>
				);
			})}
		</div>
	);
}
