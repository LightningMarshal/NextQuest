"use client";

import { useId, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GlobeIcon, Loader2Icon, LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createSession, updateSession } from "@/server/sessions";

export type PickableGame = { id: string; title: string; status: string };

export type SessionFormValues = {
	gameId: string | null;
	title: string;
	startsAt: string; // ISO
	durationMinutes: number | null;
	visibility: "members" | "open";
	capacity: number | null;
	location: string;
	joinUrl: string;
	notes: string;
	venue: "virtual" | "in_person" | "hybrid" | null;
};

type WhenChoice = { key: string; label: string; iso: string };

const emptySubscribe = () => () => {};

/** Quick picks in the browser's own timezone — only computed after mount. */
function quickTimes(now: Date): WhenChoice[] {
	const at = (daysAhead: number, hour: number) => {
		const date = new Date(now);
		date.setDate(date.getDate() + daysAhead);
		date.setHours(hour, 0, 0, 0);
		return date;
	};
	// "Now" means now: round DOWN to the minute so the session is live
	// immediately (the server accepts starts up to 30 minutes in the past).
	const choices: WhenChoice[] = [{ key: "now", label: "Now", iso: new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString() }];
	const tonight = at(0, 20);
	if (tonight.getTime() - now.getTime() > 30 * 60_000) choices.push({ key: "tonight", label: "Tonight 8pm", iso: tonight.toISOString() });
	choices.push({ key: "tomorrow", label: "Tomorrow 8pm", iso: at(1, 20).toISOString() });
	const daysToSaturday = (6 - now.getDay() + 7) % 7 || 7;
	if (daysToSaturday > 1) choices.push({ key: "saturday", label: "Saturday 2pm", iso: at(daysToSaturday, 14).toISOString() });
	return choices;
}

function toLocalInput(iso: string): string {
	const date = new Date(iso);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const LENGTHS = [
	{ value: "", label: "Not sure" },
	{ value: "60", label: "1 hour" },
	{ value: "90", label: "1½ hours" },
	{ value: "120", label: "2 hours" },
	{ value: "180", label: "3 hours" },
	{ value: "240", label: "4 hours" },
	{ value: "360", label: "6 hours" },
	{ value: "480", label: "All day-ish" },
];

export function SessionForm({
	games,
	initial,
	sessionId,
	defaultGameId,
}: {
	games: PickableGame[];
	/** Present when editing. */
	initial?: SessionFormValues;
	sessionId?: string;
	defaultGameId?: string;
}) {
	const router = useRouter();
	const listId = useId();
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
	// Computed once per mount so the chip ISO values stay stable while choosing.
	const [mountedAt] = useState(() => new Date());
	const choices = useMemo(() => (mounted ? quickTimes(mountedAt) : []), [mounted, mountedAt]);

	const initialGame = games.find((g) => g.id === (initial?.gameId ?? defaultGameId));
	const [gameText, setGameText] = useState(initialGame?.title ?? "");
	const [when, setWhen] = useState<string>(initial ? "pick" : "");
	const [pickedLocal, setPickedLocal] = useState(initial ? toLocalInput(initial.startsAt) : "");
	const [visibility, setVisibility] = useState<"members" | "open">(initial?.visibility ?? "open");

	const matchedGame = games.find((g) => g.title.toLowerCase() === gameText.trim().toLowerCase());

	function resolveStart(): string | null {
		if (when === "pick") {
			const date = new Date(pickedLocal);
			return Number.isNaN(date.getTime()) ? null : date.toISOString();
		}
		return choices.find((choice) => choice.key === when)?.iso ?? null;
	}

	function submit(formData: FormData) {
		setError(null);
		const startsAt = resolveStart();
		if (!startsAt) {
			setError("Pick when you're playing.");
			return;
		}
		formData.set("startsAt", startsAt);
		formData.set("visibility", visibility);
		formData.delete("gameText");
		if (matchedGame) formData.set("gameId", matchedGame.id);
		else if (gameText.trim()) formData.set("newGameTitle", gameText.trim());
		startTransition(async () => {
			try {
				if (sessionId) {
					await updateSession(sessionId, formData);
					router.push(`/s/${sessionId}`);
				} else {
					const { id } = await createSession(formData);
					router.push(`/s/${id}`);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong — try again.");
			}
		});
	}

	return (
		<form action={submit} className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Label htmlFor="session-game" className="text-base">
					What are you playing?
				</Label>
				<Input
					id="session-game"
					name="gameText"
					list={listId}
					value={gameText}
					onChange={(event) => setGameText(event.target.value)}
					placeholder="Rust, Wingspan, Curse of Strahd…"
					autoComplete="off"
					maxLength={200}
					className="h-11 text-base"
				/>
				<datalist id={listId}>
					{games.map((game) => (
						<option key={game.id} value={game.title} />
					))}
				</datalist>
				<p className="text-muted-foreground text-xs">
					{gameText.trim() === ""
						? "Optional — leave blank for a general game night."
						: matchedGame
							? "From the library."
							: "Not in the library yet — it'll be added so people can look it up."}
				</p>
			</div>

			<fieldset className="flex flex-col gap-2">
				<legend className="mb-2 text-base font-medium">When?</legend>
				<div className="flex flex-wrap gap-2">
					{!mounted && <span className="text-muted-foreground text-sm">Loading your local time…</span>}
					{choices.map((choice) => (
						<Button
							key={choice.key}
							type="button"
							variant={when === choice.key ? "default" : "outline"}
							aria-pressed={when === choice.key}
							onClick={() => setWhen(choice.key)}
						>
							{choice.label}
						</Button>
					))}
					{mounted && (
						<Button
							type="button"
							variant={when === "pick" ? "default" : "outline"}
							aria-pressed={when === "pick"}
							onClick={() => setWhen("pick")}
						>
							Pick a date…
						</Button>
					)}
				</div>
				{when === "pick" && (
					<Input
						type="datetime-local"
						aria-label="Date and time"
						value={pickedLocal}
						onChange={(event) => setPickedLocal(event.target.value)}
						step={300}
						required
						className="max-w-64"
					/>
				)}
			</fieldset>

			<fieldset className="flex flex-col gap-2">
				<legend className="mb-2 text-base font-medium">Who can join?</legend>
				<div className="grid gap-2 sm:grid-cols-2">
					{(
						[
							{ value: "open", icon: GlobeIcon, title: "Open to the circle", body: "Members plus invited friends and Discord-server guests." },
							{ value: "members", icon: LockIcon, title: "Members only", body: "Just the group." },
						] as const
					).map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={visibility === option.value}
							onClick={() => setVisibility(option.value)}
							className={cn(
								"flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
								visibility === option.value ? "border-primary bg-primary/10" : "hover:bg-accent"
							)}
						>
							<option.icon className={cn("mt-0.5 size-4 shrink-0", visibility === option.value && "text-primary")} />
							<span>
								<span className="block text-sm font-medium">{option.title}</span>
								<span className="text-muted-foreground block text-xs">{option.body}</span>
							</span>
						</button>
					))}
				</div>
			</fieldset>

			<details className="group rounded-lg border px-4 py-3" open={Boolean(initial)}>
				<summary className="cursor-pointer text-sm font-medium select-none">
					More details <span className="text-muted-foreground font-normal">— length, seats, where, notes</span>
				</summary>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5 sm:col-span-2">
						<Label htmlFor="session-title">Title</Label>
						<Input id="session-title" name="title" maxLength={200} defaultValue={initial?.title ?? ""} placeholder={gameText.trim() || "Game night"} />
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="session-length">How long?</Label>
						<NativeSelect id="session-length" name="durationMinutes" defaultValue={initial?.durationMinutes ? String(initial.durationMinutes) : ""}>
							{LENGTHS.map((length) => (
								<option key={length.value} value={length.value}>
									{length.label}
								</option>
							))}
							{initial?.durationMinutes && !LENGTHS.some((l) => l.value === String(initial.durationMinutes)) && (
								<option value={String(initial.durationMinutes)}>{initial.durationMinutes} min</option>
							)}
						</NativeSelect>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="session-capacity">Seats</Label>
						<NativeSelect id="session-capacity" name="capacity" defaultValue={initial?.capacity ? String(initial.capacity) : ""}>
							<option value="">No limit</option>
							{[2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
								<option key={n} value={n}>
									{n} players
								</option>
							))}
						</NativeSelect>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="session-location">Where</Label>
						<Input id="session-location" name="location" maxLength={300} defaultValue={initial?.location ?? ""} placeholder="Discord voice, Alex's place…" />
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="session-join">Join link</Label>
						<Input id="session-join" name="joinUrl" type="url" inputMode="url" maxLength={500} defaultValue={initial?.joinUrl ?? ""} placeholder="https://discord.gg/…" />
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="session-venue">Online or in person?</Label>
						<NativeSelect id="session-venue" name="venue" defaultValue={initial?.venue ?? ""}>
							<option value="">Not saying</option>
							<option value="virtual">Online</option>
							<option value="in_person">In person</option>
							<option value="hybrid">Both</option>
						</NativeSelect>
					</div>
					<div className="flex flex-col gap-1.5 sm:col-span-2">
						<Label htmlFor="session-notes">Notes</Label>
						<Textarea id="session-notes" name="notes" rows={2} maxLength={2000} defaultValue={initial?.notes ?? ""} placeholder="Fresh wipe. Bring a mic." />
					</div>
				</div>
			</details>

			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-3">
				<Button size="lg" className="glow-primary" disabled={pending}>
					{pending && <Loader2Icon className="animate-spin" />}
					{sessionId ? "Save changes" : "Post session"}
				</Button>
				{!sessionId && (
					<span className="text-muted-foreground text-xs">
						You&apos;re in automatically. {visibility === "open" ? "Announced to every connected Discord." : "Announced to the group's Discord."}
					</span>
				)}
			</div>
		</form>
	);
}
