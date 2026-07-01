"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlusIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEvent } from "@/server/events";

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
}: {
	games: { id: string; title: string }[];
}) {
	const formRef = useRef<HTMLFormElement>(null);

	async function handleAction(formData: FormData) {
		// datetime-local is timezone-less; convert to ISO here, where we know
		// the browser's timezone — the server runs in UTC.
		const local = String(formData.get("scheduledAtLocal") ?? "");
		if (local) formData.set("scheduledAt", new Date(local).toISOString());
		await createEvent(formData);
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
								defaultValue=""
								className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
							>
								<option value="">none / undecided</option>
								{games.map((game) => (
									<option key={game.id} value={game.id}>
										{game.title}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="event-when">When</Label>
							<Input id="event-when" name="scheduledAtLocal" type="datetime-local" required />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="event-duration">Duration (minutes, optional)</Label>
							<Input id="event-duration" name="durationMinutes" type="number" min="15" step="15" placeholder="120" />
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="event-location">Where (optional)</Label>
						<Input id="event-location" name="location" maxLength={300} placeholder="Discord / the couch / a URL" />
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
					<div>
						<SubmitButton />
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
