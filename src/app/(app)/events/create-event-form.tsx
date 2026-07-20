"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlusIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEvent } from "@/server/events";

import { GameSelectOptions, type SelectableGame } from "./game-select-options";

/** Now rounded up to the next quarter hour, as a datetime-local string. */
function nextQuarterHourLocal(): string {
	const next = new Date(Math.ceil(Date.now() / 900_000) * 900_000);
	return new Date(next.getTime() - next.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const emptySubscribe = () => () => {};

/**
 * The picker's `min` floor is local-time-dependent, so the server (and
 * hydration pass) renders no floor and the client snapshot supplies it —
 * same useSyncExternalStore dance as LocalTime.
 */
export function useMinDatetimeLocal(): string | undefined {
	return useSyncExternalStore(emptySubscribe, nextQuarterHourLocal, () => undefined);
}

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button className="glow-primary" disabled={pending}>
			{pending ? <Loader2Icon className="animate-spin" /> : <CalendarPlusIcon />}
			Schedule
		</Button>
	);
}

export function CreateEventForm({
	games,
	defaultGameId,
}: {
	games: SelectableGame[];
	/** Preselects the game — "plan a session with this" deep link (#34). */
	defaultGameId?: string;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const [error, setError] = useState<string | null>(null);
	const minWhen = useMinDatetimeLocal();

	async function handleAction(formData: FormData) {
		setError(null);
		// datetime-local is timezone-less; convert to ISO here, where we know
		// the browser's timezone — the server runs in UTC.
		const local = String(formData.get("scheduledAtLocal") ?? "");
		const when = new Date(local);
		if (Number.isNaN(when.getTime())) {
			setError("That date and time couldn't be read — please re-pick it.");
			return;
		}
		formData.set("scheduledAt", when.toISOString());
		try {
			await createEvent(formData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong — try again.");
			return;
		}
		formRef.current?.reset();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Schedule a session</CardTitle>
				<CardDescription>You&apos;re automatically RSVP&apos;d yes to your own events.</CardDescription>
			</CardHeader>
			<CardContent>
				<form ref={formRef} action={handleAction} className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="event-title">Title</Label>
							<Input id="event-title" name="title" required maxLength={200} placeholder="Friday co-op night" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="event-game">Game (optional)</Label>
							<select
								id="event-game"
								name="gameId"
								defaultValue={defaultGameId ?? ""}
								className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
							>
								<option value="">none / undecided</option>
								<GameSelectOptions games={games} />
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="event-when">When</Label>
							<Input
								id="event-when"
								name="scheduledAtLocal"
								type="datetime-local"
								required
								min={minWhen}
								step={900}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="event-duration">Duration (minutes, optional)</Label>
							<Input id="event-duration" name="durationMinutes" type="number" min="15" step="15" placeholder="120" />
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="event-venue">How (optional)</Label>
							<select
								id="event-venue"
								name="venue"
								defaultValue=""
								className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
							>
								<option value="">unspecified</option>
								<option value="virtual">virtual</option>
								<option value="in_person">in person</option>
								<option value="hybrid">hybrid</option>
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="event-location">Where (optional)</Label>
							<Input id="event-location" name="location" maxLength={300} placeholder="Discord / the couch / a URL" />
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="event-notes">Notes (optional)</Label>
						<textarea
							id="event-notes"
							name="notes"
							rows={2}
							maxLength={5000}
							placeholder="Bring snacks. We're finishing the run."
							className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
						/>
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
