import { Avatar } from "@/components/avatar";
import { summarizeRoster, type RosterEntry } from "@/lib/sessions";
import { cn } from "@/lib/utils";

/** Stacked faces + names: the at-a-glance "who's in". */
export function RosterFaces({
	roster,
	capacity,
	max = 6,
	className,
}: {
	roster: RosterEntry[];
	capacity: number | null;
	max?: number;
	className?: string;
}) {
	const { going, maybe, spotsLeft, full } = summarizeRoster(roster, capacity);
	const shown = going.slice(0, max);
	return (
		<div className={cn("flex min-w-0 items-center gap-2", className)}>
			{going.length > 0 ? (
				<div className="flex -space-x-2">
					{shown.map((entry) => (
						<Avatar key={entry.userId} name={entry.name} image={entry.image} />
					))}
					{going.length > max && (
						<span className="bg-muted ring-background flex size-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2">
							+{going.length - max}
						</span>
					)}
				</div>
			) : null}
			<p className="text-muted-foreground min-w-0 truncate text-xs">
				{going.length === 0 ? (
					"Nobody in yet"
				) : (
					<>
						<span className="text-foreground font-medium">{going.map((e) => e.name.split(" ")[0]).join(", ")}</span>
						{" in"}
					</>
				)}
				{maybe.length > 0 && ` · ${maybe.length} maybe`}
				{capacity !== null && (
					<span className={cn("stat ml-1", full && "text-destructive")}>
						· {full ? "full" : `${spotsLeft} of ${capacity} left`}
					</span>
				)}
			</p>
		</div>
	);
}

/** Full name lists for the session page. */
export function RosterLists({ roster, capacity }: { roster: RosterEntry[]; capacity: number | null }) {
	const { going, maybe, out } = summarizeRoster(roster, capacity);
	const section = (label: string, entries: RosterEntry[], tone?: string) =>
		entries.length > 0 && (
			<div className="flex flex-col gap-2">
				<p className={cn("text-xs font-medium tracking-wide uppercase", tone)}>
					{label} <span className="stat text-muted-foreground font-normal">{entries.length}</span>
				</p>
				<ul className="flex flex-wrap gap-x-4 gap-y-2">
					{entries.map((entry) => (
						<li key={entry.userId} className="flex items-center gap-2 text-sm">
							<Avatar name={entry.name} image={entry.image} />
							{entry.name}
							{entry.isGuest && <span className="text-muted-foreground text-xs">guest</span>}
						</li>
					))}
				</ul>
			</div>
		);
	return (
		<div className="flex flex-col gap-4">
			{section(capacity !== null ? `In (${capacity} seats)` : "In", going, "text-success")}
			{section("Maybe", maybe)}
			{out.length > 0 && <p className="text-muted-foreground text-xs">{out.length} can&apos;t make it</p>}
			{going.length + maybe.length === 0 && <p className="text-muted-foreground text-sm">Nobody yet — be the first.</p>}
		</div>
	);
}
