"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, StarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { wrapUpSession } from "@/server/sessions";

export type WrapUpCandidate = { userId: string; name: string; checked: boolean };

/**
 * The 10-second wrap-up: tick who came (pre-ticked from "in"), tap stars,
 * one line, done. Game-played and "where we left off" hide under More.
 */
export function WrapUpForm({
	sessionId,
	candidates,
	games,
	gameId,
	isCampaign,
}: {
	sessionId: string;
	candidates: WrapUpCandidate[];
	games: { id: string; title: string }[];
	gameId: string | null;
	/** Tabletop campaigns want "where we left off" up front. */
	isCampaign: boolean;
}) {
	const router = useRouter();
	const [rating, setRating] = useState<number | null>(null);
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	return (
		<form
			id="wrap-up"
			className="flex flex-col gap-4"
			action={(formData) => {
				setError(null);
				if (rating) formData.set("howItWent", String(rating));
				startTransition(async () => {
					try {
						const { nextId } = await wrapUpSession(sessionId, formData);
						router.push(nextId ? `/s/${nextId}` : `/s/${sessionId}`);
					} catch (err) {
						setError(err instanceof Error ? err.message : "Couldn't save — try again.");
					}
				});
			}}
		>
			<fieldset className="flex flex-col gap-2">
				<legend className="mb-1 text-sm font-medium">Who came?</legend>
				<div className="grid gap-2 sm:grid-cols-2">
					{candidates.map((person) => (
						<label key={person.userId} className="flex items-center gap-2 text-sm">
							<input type="checkbox" name="attended" value={person.userId} defaultChecked={person.checked} className="accent-primary size-4" />
							{person.name}
						</label>
					))}
				</div>
			</fieldset>

			<fieldset className="flex flex-col gap-2">
				<legend className="mb-1 text-sm font-medium">How did it go?</legend>
				<div className="flex gap-1" role="radiogroup" aria-label="Rating">
					{[1, 2, 3, 4, 5].map((value) => (
						<button
							key={value}
							type="button"
							role="radio"
							aria-checked={rating === value}
							aria-label={`${value} star${value === 1 ? "" : "s"}`}
							onClick={() => setRating(rating === value ? null : value)}
							className="p-1"
						>
							<StarIcon className={cn("size-7", rating !== null && value <= rating ? "fill-primary text-primary" : "text-muted-foreground")} />
						</button>
					))}
				</div>
			</fieldset>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="wrap-recap">One line about it (optional)</Label>
				<Input id="wrap-recap" name="recap" maxLength={2000} placeholder="Finally beat the raid boss. Casey carried." />
			</div>

			{isCampaign && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="wrap-progress">Where we left off</Label>
					<Textarea id="wrap-progress" name="progressNote" rows={2} maxLength={2000} placeholder="At the gates of Castle Ravenloft…" />
				</div>
			)}

			<details className="rounded-lg border px-3 py-2">
				<summary className="cursor-pointer text-sm select-none">More</summary>
				<div className="mt-3 grid gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="wrap-game">What did you actually play?</Label>
						<NativeSelect id="wrap-game" name="gameId" defaultValue={gameId ?? ""}>
							<option value="">Nothing in the library</option>
							{games.map((game) => (
								<option key={game.id} value={game.id}>
									{game.title}
								</option>
							))}
						</NativeSelect>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="wrap-newgame">…or something new</Label>
						<Input id="wrap-newgame" name="newGameTitle" maxLength={200} placeholder="Jackbox Party Pack 9" />
					</div>
					{!isCampaign && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="wrap-progress">Where we left off</Label>
							<Textarea id="wrap-progress" name="progressNote" rows={2} maxLength={2000} />
						</div>
					)}
				</div>
			</details>

			<label className="flex items-center gap-2 text-sm">
				<input type="checkbox" name="scheduleNext" value="1" className="accent-primary size-4" />
				Same time next week
			</label>

			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			<Button className="self-start" disabled={pending}>
				{pending && <Loader2Icon className="animate-spin" />}
				Save wrap-up
			</Button>
		</form>
	);
}
