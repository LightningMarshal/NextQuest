"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarSearchIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGridPoll } from "@/server/availability";

import { GameSelectOptions, type SelectableGame } from "./game-select-options";

// Grid-poll creation (issue #33): pick the candidate DAYS and a daily time
// window; members then paint the 15-minute blocks that work on the grid.
// Times use 15-minute steps, and the end time follows the start by default.

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button disabled={pending}>
			{pending ? <Loader2Icon className="animate-spin" /> : <CalendarSearchIcon />}
			Open the grid
		</Button>
	);
}

type DayRow = { key: number; date: string; start: string; end: string };

function isoDate(date: Date): string {
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
	const date = new Date(`${dateIso}T12:00:00`);
	date.setDate(date.getDate() + days);
	return isoDate(date);
}

/** "18:00" + 120min → "20:00" (wraps within the day). */
function shiftTime(time: string, minutes: number): string {
	const [h, m] = time.split(":").map(Number);
	const total = (h * 60 + m + minutes) % (24 * 60);
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function CreatePollForm({ games }: { games: SelectableGame[] }) {
	const formRef = useRef<HTMLFormElement>(null);
	// Lazy initializer: "now" is impure, so it runs once, not per render.
	const [anchor] = useState(() => {
		const today = isoDate(new Date());
		return { today, tomorrow: addDays(today, 1) };
	});
	const { today, tomorrow } = anchor;
	const [days, setDays] = useState<DayRow[]>(() => [
		{ key: 0, date: tomorrow, start: "18:00", end: "23:00" },
		{ key: 1, date: addDays(tomorrow, 1), start: "18:00", end: "23:00" },
	]);
	const nextKey = useRef(2);
	const [sessionMinutes, setSessionMinutes] = useState(120);
	const [error, setError] = useState<string | null>(null);

	function addDay() {
		setDays((rows) => {
			const last = rows[rows.length - 1];
			return [
				...rows,
				{
					key: nextKey.current++,
					date: last ? addDays(last.date, 1) : tomorrow,
					start: last?.start ?? "18:00",
					end: last?.end ?? "23:00",
				},
			];
		});
	}

	function update(key: number, patch: Partial<DayRow>) {
		setDays((rows) =>
			rows.map((row) => {
				if (row.key !== key) return row;
				const next = { ...row, ...patch };
				// The end time follows the start: keep it after the start by at
				// least the session length unless the user has set it themselves.
				if (patch.start && next.end <= patch.start) {
					next.end = shiftTime(patch.start, sessionMinutes);
				}
				return next;
			})
		);
	}

	async function handleAction(formData: FormData) {
		setError(null);
		// datetime pieces are timezone-less; combine in the browser where local
		// means local, then ship ISO instants (same dance as the event form).
		const windows: { start: string; end: string }[] = [];
		for (const row of days) {
			if (!row.date || !row.start || !row.end) continue;
			const start = new Date(`${row.date}T${row.start}`);
			// An end at/before the start means the window crosses midnight.
			let end = new Date(`${row.date}T${row.end}`);
			if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60_000);
			if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
				setError("One of the days couldn't be read — please re-pick it.");
				return;
			}
			windows.push({ start: start.toISOString(), end: end.toISOString() });
		}
		try {
			await createGridPoll({
				title: String(formData.get("title") ?? ""),
				gameId: String(formData.get("gameId") ?? "") || undefined,
				newGameTitle: String(formData.get("newGameTitle") ?? "").trim() || undefined,
				sessionMinutes,
				windows,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong — try again.");
			return;
		}
		formRef.current?.reset();
		setDays([
			{ key: nextKey.current++, date: tomorrow, start: "18:00", end: "23:00" },
			{ key: nextKey.current++, date: addDays(tomorrow, 1), start: "18:00", end: "23:00" },
		]);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Find a time (GAC)</CardTitle>
				<CardDescription>
					Pick candidate days and a window for each; everyone paints the 15-minute blocks that
					work for them, and the best-covered stretch becomes the session.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form ref={formRef} action={handleAction} className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="poll-title">What for</Label>
							<Input id="poll-title" name="title" required maxLength={200} placeholder="Raid night" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="poll-duration">Session length</Label>
							<select
								id="poll-duration"
								value={sessionMinutes}
								onChange={(event) => setSessionMinutes(Number(event.target.value))}
								className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
							>
								<option value="60">1 hour</option>
								<option value="90">1.5 hours</option>
								<option value="120">2 hours</option>
								<option value="180">3 hours</option>
								<option value="240">4 hours</option>
							</select>
						</div>
					</div>
					{/* Issue #37: what the poll is trying to schedule — an existing
					    game, or a typed title that creates a proposed entry. Copied
					    onto the event when a window is scheduled. */}
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="poll-game">Game (optional)</Label>
							<select
								id="poll-game"
								name="gameId"
								defaultValue=""
								className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
							>
								<option value="">none / undecided</option>
								<GameSelectOptions games={games} />
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="poll-new-game">…or something not in the list</Label>
							<Input
								id="poll-new-game"
								name="newGameTitle"
								maxLength={200}
								placeholder="typed titles are added as proposals"
							/>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Candidate days</Label>
						{days.map((row) => (
							<div key={row.key} className="flex flex-wrap items-center gap-2">
								<Input
									type="date"
									value={row.date}
									min={today}
									onChange={(event) => update(row.key, { date: event.target.value })}
									aria-label="Day"
									className="w-40"
								/>
								<Input
									type="time"
									value={row.start}
									step={900}
									onChange={(event) => update(row.key, { start: event.target.value })}
									aria-label="Window start"
									className="w-28"
								/>
								<span className="text-muted-foreground text-sm">to</span>
								<Input
									type="time"
									value={row.end}
									step={900}
									onChange={(event) => update(row.key, { end: event.target.value })}
									aria-label="Window end"
									className="w-28"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8"
									aria-label="Remove day"
									disabled={days.length <= 1}
									onClick={() => setDays((rows) => rows.filter((r) => r.key !== row.key))}
								>
									<XIcon />
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="w-fit"
							disabled={days.length >= 14}
							onClick={addDay}
						>
							<PlusIcon />
							Add a day
						</Button>
						<p className="text-muted-foreground text-xs">
							An end time at or before the start means the window runs overnight.
						</p>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div>
						<SubmitButton />
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
