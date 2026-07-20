"use client";

import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { CalendarCheckIcon, CheckIcon, Loader2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CELL_MS, cellsToIntervals } from "@/lib/availability-grid";
import { cn } from "@/lib/utils";
import { saveAvailability, scheduleGridWindow } from "@/server/availability";

// The whenisgood-style grid (issue #33): columns are the poll's day-windows,
// rows are 15-minute cells. Members paint what works; everyone's marks show
// as a heatmap; the best fully-covered spans get one-click scheduling.

export type GridWindow = { startsAt: Date; endsAt: Date };
export type GridMark = { userId: string; name: string; startsAt: Date; endsAt: Date };
export type GridSuggestion = { startIso: string; endIso: string; names: string[] };

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function expandCells(startsAt: Date, endsAt: Date): number[] {
	const cells: number[] = [];
	for (let ms = startsAt.getTime(); ms < endsAt.getTime(); ms += CELL_MS) cells.push(ms);
	return cells;
}

function dayLabel(date: Date): string {
	return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(date: Date): string {
	return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function AvailabilityGridCard({
	pollId,
	title,
	creatorName,
	open,
	scheduled,
	sessionMinutes,
	windows,
	marks,
	currentUserId,
	memberCount,
	suggestions,
}: {
	pollId: string;
	title: string;
	creatorName: string | null;
	open: boolean;
	/** A scheduled event points back at this poll. */
	scheduled: boolean;
	sessionMinutes: number;
	windows: GridWindow[];
	marks: GridMark[];
	currentUserId: string;
	memberCount: number;
	/** Server-computed bestWindows over SAVED marks. */
	suggestions: GridSuggestion[];
}) {
	// Local times only exist client-side — SSR would render UTC and mismatch,
	// so the grid body renders after hydration (skeleton until then). Same
	// useSyncExternalStore dance as LocalTime/DateChip.
	const mounted = useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);

	const [myCells, setMyCellsState] = useState<Set<number>>(
		() =>
			new Set(
				marks
					.filter((mark) => mark.userId === currentUserId)
					.flatMap((mark) => expandCells(mark.startsAt, mark.endsAt))
			)
	);
	// Ref mirror so pointer handlers read/write without functional updaters
	// (persisting inside an updater would double-fire under StrictMode).
	const cellsRef = useRef(myCells);
	function setMyCells(next: Set<number>) {
		cellsRef.current = next;
		setMyCellsState(next);
	}
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
	const [, startTransition] = useTransition();
	const drag = useRef<{ mode: "paint" | "erase" } | null>(null);

	// Heatmap layer: who ELSE covers each cell (own marks render separately).
	const othersByCell = useMemo(() => {
		const map = new Map<number, string[]>();
		for (const mark of marks) {
			if (mark.userId === currentUserId) continue;
			for (const cell of expandCells(mark.startsAt, mark.endsAt)) {
				map.set(cell, [...(map.get(cell) ?? []), mark.name]);
			}
		}
		return map;
	}, [marks, currentUserId]);
	const maxOthers = Math.max(1, memberCount - 1);

	function persist(cells: Set<number>) {
		setSaveState("saving");
		const intervals = cellsToIntervals([...cells]).map((interval) => ({
			start: interval.startsAt.toISOString(),
			end: interval.endsAt.toISOString(),
		}));
		startTransition(async () => {
			try {
				await saveAvailability(pollId, intervals);
				setSaveState("saved");
			} catch {
				setSaveState("error");
			}
		});
	}

	function applyCell(ms: number) {
		if (!drag.current) return;
		const mode = drag.current.mode;
		const has = cellsRef.current.has(ms);
		if (mode === "paint" ? has : !has) return;
		const next = new Set(cellsRef.current);
		if (mode === "paint") next.add(ms);
		else next.delete(ms);
		setMyCells(next);
	}

	function cellFromPoint(clientX: number, clientY: number): number | null {
		const el = document.elementFromPoint(clientX, clientY)?.closest("[data-cell]");
		const value = el?.getAttribute("data-cell");
		return value ? Number(value) : null;
	}

	function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (!open) return;
		const ms = cellFromPoint(event.clientX, event.clientY);
		if (ms === null) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { mode: myCells.has(ms) ? "erase" : "paint" };
		applyCell(ms);
	}

	function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
		if (!drag.current) return;
		const ms = cellFromPoint(event.clientX, event.clientY);
		if (ms !== null) applyCell(ms);
	}

	function endStroke() {
		if (!drag.current) return;
		drag.current = null;
		persist(cellsRef.current);
	}

	function toggleSingle(ms: number) {
		if (!open) return;
		const next = new Set(cellsRef.current);
		if (next.has(ms)) next.delete(ms);
		else next.add(ms);
		setMyCells(next);
		persist(next);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center gap-2">
					<CardTitle>{title}</CardTitle>
					{scheduled && (
						<Badge variant="secondary" className="gap-1">
							<CalendarCheckIcon className="size-3" />
							scheduled
						</Badge>
					)}
					{!open && !scheduled && <Badge variant="outline">closed</Badge>}
				</div>
				<CardDescription>
					{open
						? `Paint every 15-minute block that works for you — looking to seat ${Math.round((sessionMinutes / 60) * 10) / 10}h. Darker = more of the group is free.`
						: "This poll is closed."}
					{creatorName && ` Started by ${creatorName}.`}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{!mounted ? (
					<div className="bg-muted/40 h-48 animate-pulse rounded-md" aria-hidden />
				) : (
					<div
						className={cn("flex flex-wrap gap-3 select-none", open && "touch-none")}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={endStroke}
						onPointerCancel={endStroke}
					>
						{windows.map((window) => (
							<div key={window.startsAt.getTime()} className="flex min-w-24 flex-col gap-1">
								<p className="text-xs font-medium">{dayLabel(window.startsAt)}</p>
								<div className="border-border overflow-hidden rounded-md border">
									{expandCells(window.startsAt, window.endsAt).map((ms) => {
										const date = new Date(ms);
										const mine = myCells.has(ms);
										const others = othersByCell.get(ms) ?? [];
										const isHour = date.getMinutes() === 0;
										const names = [...(mine ? ["you"] : []), ...others];
										return (
											<button
												key={ms}
												type="button"
												data-cell={ms}
												disabled={!open}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														toggleSingle(ms);
													}
												}}
												title={`${timeLabel(date)} — ${names.length > 0 ? `${names.join(", ")} (${names.length}/${memberCount})` : "nobody yet"}`}
												aria-label={`${dayLabel(date)} ${timeLabel(date)}${mine ? " — you're free" : ""}`}
												aria-pressed={mine}
												className={cn(
													"relative block h-4 w-full cursor-pointer",
													isHour ? "border-border border-t" : "border-border/40 border-t",
													!open && "cursor-default"
												)}
												style={{
													backgroundColor: mine
														? "var(--color-primary)"
														: others.length > 0
															? `color-mix(in oklab, var(--color-chart-2) ${Math.round((others.length / maxOthers) * 70) + 10}%, transparent)`
															: undefined,
												}}
											>
												{isHour && (
													<span
														className={cn(
															"pointer-events-none absolute top-0 left-1 text-[9px] leading-4",
															mine ? "text-primary-foreground" : "text-muted-foreground"
														)}
													>
														{timeLabel(date)}
													</span>
												)}
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				)}

				{open && (
					<p className="text-muted-foreground text-xs" role="status">
						{saveState === "saving" && (
							<span className="flex items-center gap-1">
								<Loader2Icon className="size-3 animate-spin" /> Saving your availability…
							</span>
						)}
						{saveState === "saved" && (
							<span className="text-success flex items-center gap-1">
								<CheckIcon className="size-3" /> Saved — everyone sees the heatmap update.
							</span>
						)}
						{saveState === "error" && (
							<span className="text-destructive">
								Couldn&apos;t save — check your connection and paint again.
							</span>
						)}
						{saveState === "idle" &&
							"Click or drag to paint. Your color is solid; the group's overlap shades darker."}
					</p>
				)}

				{open && suggestions.length > 0 && (
					<div className="flex flex-col gap-2 border-t pt-3">
						<p className="text-sm font-medium">Best windows so far</p>
						{suggestions.map((suggestion) => {
							const start = new Date(suggestion.startIso);
							const end = new Date(suggestion.endIso);
							return (
								<div
									key={suggestion.startIso}
									className="flex flex-wrap items-center justify-between gap-2 text-sm"
								>
									<span>
										<span className="font-medium">
											{dayLabel(start)} · {timeLabel(start)}–{timeLabel(end)}
										</span>{" "}
										<span className="text-muted-foreground">
											— {suggestion.names.join(", ")} ({suggestion.names.length}/{memberCount})
										</span>
									</span>
									<form action={scheduleGridWindow.bind(null, pollId, suggestion.startIso, suggestion.endIso)}>
										<Button size="sm" variant="outline">
											Schedule this
										</Button>
									</form>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
