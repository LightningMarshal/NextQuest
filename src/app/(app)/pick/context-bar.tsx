"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Commitment, SessionContext } from "@/lib/pick";
import { cn } from "@/lib/utils";

const COMMITMENT_CHIPS: { value: Commitment; label: string; hint: string }[] = [
	{ value: "any", label: "Anything", hint: "no length preference" },
	{ value: "snack", label: "Snack", hint: "< 8h" },
	{ value: "weeknight", label: "Weeknight", hint: "8–25h" },
	{ value: "standard", label: "Standard", hint: "25–60h" },
	{ value: "epic", label: "Epic", hint: "60h+" },
];

export type NextEventContext = {
	title: string;
	scheduledAt: Date;
	durationMinutes: number | null;
	yesCount: number;
} | null;

// All context state lives in the URL so the server re-ranks on every change
// and the resulting view is shareable. Defaults are dropped from the query
// string (same convention as the backlog sort links).
function contextHref(ctx: SessionContext): string {
	const params = new URLSearchParams();
	if (ctx.sessionHours !== undefined) params.set("hours", String(ctx.sessionHours));
	if (ctx.commitment !== "any") params.set("commitment", ctx.commitment);
	if (ctx.together) params.set("together", "1");
	if (ctx.players !== undefined) params.set("players", String(ctx.players));
	const query = params.toString();
	return query ? `/pick?${query}` : "/pick";
}

export function ContextBar({ ctx, nextEvent }: { ctx: SessionContext; nextEvent: NextEventContext }) {
	const router = useRouter();
	// Draft state only for the debounced numeric inputs; chips/toggles apply
	// immediately. Handlers that change hours/players elsewhere (event
	// prefill, together toggle) update the drafts themselves.
	const [hoursDraft, setHoursDraft] = useState(ctx.sessionHours?.toString() ?? "");
	const [playersDraft, setPlayersDraft] = useState(ctx.players?.toString() ?? "");
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	function apply(next: SessionContext) {
		router.replace(contextHref(next), { scroll: false });
	}

	function applyDebounced(next: SessionContext) {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => apply(next), 400);
	}

	function parseDraftHours(draft: string): number | undefined {
		const value = Number(draft);
		return Number.isFinite(value) && value > 0 ? value : undefined;
	}

	function parseDraftPlayers(draft: string): number | undefined {
		const value = Number(draft);
		return Number.isInteger(value) && value > 0 ? value : undefined;
	}

	const eventHours =
		nextEvent?.durationMinutes != null ? Math.round((nextEvent.durationMinutes / 60) * 10) / 10 : undefined;
	const canUseEvent = nextEvent !== null && (eventHours !== undefined || nextEvent.yesCount >= 2);

	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-end gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="pick-hours">Hours tonight</Label>
						<Input
							id="pick-hours"
							type="number"
							min="0.5"
							max="200"
							step="0.5"
							placeholder="e.g. 3"
							value={hoursDraft}
							onChange={(event) => {
								setHoursDraft(event.target.value);
								applyDebounced({ ...ctx, sessionHours: parseDraftHours(event.target.value) });
							}}
							className="w-24"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>How big a game?</Label>
						<div className="border-border bg-card flex items-center gap-0.5 rounded-lg border p-0.5 text-xs">
							{COMMITMENT_CHIPS.map((chip) => (
								<button
									key={chip.value}
									type="button"
									title={chip.hint}
									onClick={() => apply({ ...ctx, commitment: chip.value })}
									className={cn(
										"cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors",
										chip.value === ctx.commitment
											? "bg-primary/12 text-primary"
											: "text-muted-foreground hover:text-foreground"
									)}
								>
									{chip.label}
								</button>
							))}
						</div>
					</div>
					<div className="flex items-end gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pick-together">Playing together?</Label>
							<Button
								id="pick-together"
								type="button"
								variant={ctx.together ? "default" : "outline"}
								size="sm"
								aria-pressed={ctx.together}
								onClick={() => {
									if (ctx.together) setPlayersDraft("");
									apply({
										...ctx,
										together: !ctx.together,
										players: !ctx.together ? ctx.players : undefined,
									});
								}}
							>
								<UsersIcon className="size-3.5" />
								{ctx.together ? "Together" : "Solo / any"}
							</Button>
						</div>
						{ctx.together && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="pick-players">Players</Label>
								<Input
									id="pick-players"
									type="number"
									min="1"
									max="20"
									placeholder="4"
									value={playersDraft}
									onChange={(event) => {
										setPlayersDraft(event.target.value);
										applyDebounced({ ...ctx, players: parseDraftPlayers(event.target.value) });
									}}
									className="w-20"
								/>
							</div>
						)}
					</div>
				</div>

				{canUseEvent && (
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								const next: SessionContext = {
									sessionHours: eventHours ?? ctx.sessionHours,
									commitment: ctx.commitment,
									together: true,
									players: nextEvent.yesCount >= 2 ? nextEvent.yesCount : ctx.players,
								};
								setHoursDraft(next.sessionHours?.toString() ?? "");
								setPlayersDraft(next.players?.toString() ?? "");
								apply(next);
							}}
						>
							<CalendarClockIcon className="size-3.5" />
							Use next session
						</Button>
						<span className="text-muted-foreground text-xs">
							{nextEvent.title}
							{eventHours !== undefined ? ` · ${eventHours}h` : ""}
							{` · ${nextEvent.yesCount} going`}
						</span>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
