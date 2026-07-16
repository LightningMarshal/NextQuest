import { CalendarPlusIcon, CheckIcon, ClockIcon, Gamepad2Icon, MapPinIcon } from "lucide-react";

import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { cancelEvent, recordAttendance, scheduleNextSession, setRsvp } from "@/server/events";

import { DateChip } from "./date-chip";

export type EventAttendee = {
	userId: string;
	name: string;
	rsvp: "yes" | "no" | "maybe" | null;
	attended: boolean | null;
};

export type EventWithDetails = {
	id: string;
	title: string;
	status: "scheduled" | "completed" | "cancelled";
	scheduledAt: Date;
	durationMinutes: number | null;
	location: string | null;
	notes: string | null;
	recap: string | null;
	howItWent: number | null;
	progressNote: string | null;
	gameId: string | null;
	gameTitle: string | null;
	creatorName: string | null;
	attendance: EventAttendee[];
};

const RSVP_OPTIONS = [
	{ value: "yes", label: "I'm in" },
	{ value: "maybe", label: "Maybe" },
	{ value: "no", label: "Can't" },
] as const;

function rsvpNames(attendance: EventAttendee[], rsvp: "yes" | "maybe") {
	return attendance.filter((a) => a.rsvp === rsvp).map((a) => a.name);
}

export function EventCard({
	event,
	currentUserId,
	members,
	candidateGames = [],
	needsWrapUp = false,
}: {
	event: EventWithDetails;
	currentUserId: string;
	/** Approved members, for the wrap-up checklist. */
	members: { id: string; name: string }[];
	/** Games to pick from for "what did you play" — only wrap-up cards use it. */
	candidateGames?: { id: string; title: string }[];
	needsWrapUp?: boolean;
}) {
	const myRsvp = event.attendance.find((a) => a.userId === currentUserId)?.rsvp ?? null;
	const yes = rsvpNames(event.attendance, "yes");
	const maybe = rsvpNames(event.attendance, "maybe");
	const noCount = event.attendance.filter((a) => a.rsvp === "no").length;
	const attendees = event.attendance.filter((a) => a.attended === true).map((a) => a.name);
	// The wrap-up game picker offers the current candidates plus the event's
	// own game if it has since left the playing/backlog list.
	const wrapUpGames =
		event.gameId && !candidateGames.some((game) => game.id === event.gameId)
			? [{ id: event.gameId, title: event.gameTitle ?? "current game" }, ...candidateGames]
			: candidateGames;

	return (
		<Card className="h-full">
			<CardContent className="flex h-full flex-col gap-3">
				{/* Nova: date chip + title block. */}
				<div className="flex items-start gap-3">
					<DateChip date={event.scheduledAt} />
					<div className="flex min-w-0 flex-col gap-1">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="font-display text-base font-semibold">{event.title}</h3>
							{event.status === "cancelled" && <Badge variant="destructive">cancelled</Badge>}
							{event.status === "completed" && <Badge variant="secondary">completed</Badge>}
							{needsWrapUp && <Badge variant="outline">needs wrap-up</Badge>}
						</div>
						<div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
							<span className="stat flex items-center gap-1">
								<ClockIcon className="size-3" />
								<LocalTime date={event.scheduledAt} withWeekday />
								{event.durationMinutes && ` · ${event.durationMinutes} min`}
							</span>
							{event.gameTitle && (
								<span className="flex items-center gap-1">
									<Gamepad2Icon className="size-3" />
									{event.gameTitle}
								</span>
							)}
							{event.location && (
								<span className="flex items-center gap-1">
									<MapPinIcon className="size-3" />
									{event.location}
								</span>
							)}
							{event.creatorName && <span>by {event.creatorName}</span>}
						</div>
					</div>
				</div>

				{/* Planning notes stay visible until the session is wrapped up; after
			    that the recap takes over (its own column, never overwrites notes). */}
			{event.status === "scheduled" && event.notes && (
				<p className="text-sm whitespace-pre-line">{event.notes}</p>
			)}

			{event.status === "completed" && (event.recap || event.howItWent || event.progressNote) && (
				<div className="flex flex-col gap-1.5">
					{event.howItWent && (
						<Badge variant="secondary" className="w-fit">
							Went {event.howItWent}/5
						</Badge>
					)}
					{event.recap && <p className="text-sm whitespace-pre-line">{event.recap}</p>}
					{event.progressNote && (
						<p className="text-muted-foreground text-sm whitespace-pre-line">
							<span className="font-medium">Where we left off:</span> {event.progressNote}
						</p>
					)}
				</div>
			)}

				{event.status === "scheduled" && (
					<div className="text-muted-foreground text-xs">
						{yes.length > 0 && (
							<p>
								<span className="text-success font-medium">In ({yes.length}):</span>{" "}
								{yes.join(", ")}
							</p>
						)}
						{maybe.length > 0 && (
							<p>
								<span className="font-medium">Maybe ({maybe.length}):</span> {maybe.join(", ")}
							</p>
						)}
						{noCount > 0 && <p>{noCount} can&apos;t make it</p>}
					</div>
				)}

				{event.status === "completed" && attendees.length > 0 && (
					<p className="text-muted-foreground text-xs">
						<span className="text-foreground font-medium">Showed up ({attendees.length}):</span>{" "}
						{attendees.join(", ")}
					</p>
				)}

				{/* Clone-forward recurrence: "same time next week" as an explicit
				    action, not a rules engine (docs/DECISIONS.md). */}
				{event.status === "completed" && (
					<form action={scheduleNextSession.bind(null, event.id)} className="mt-auto pt-1">
						<Button size="sm" variant="outline">
							<CalendarPlusIcon className="size-3.5" />
							Schedule next week
						</Button>
					</form>
				)}

				{event.status === "scheduled" && !needsWrapUp && (
					<div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
						{/* Nova: the selected "yes" pill is success-tinted; maybe/no muted. */}
						{RSVP_OPTIONS.map((option) => {
							const active = myRsvp === option.value;
							return (
								<form key={option.value} action={setRsvp.bind(null, event.id, option.value)}>
									<Button
										size="sm"
										variant={active && option.value !== "yes" ? "secondary" : "outline"}
										className={cn(
											active &&
												option.value === "yes" &&
												"border-success/40 bg-success/15 text-success hover:bg-success/25 hover:text-success"
										)}
									>
										{active && <CheckIcon />}
										{option.label}
									</Button>
								</form>
							);
						})}
						<form action={cancelEvent.bind(null, event.id)} className="ml-auto">
							<Button size="sm" variant="ghost">
								Cancel event
							</Button>
						</form>
					</div>
				)}

				{needsWrapUp && (
					<form
						action={recordAttendance.bind(null, event.id)}
						className="flex flex-col gap-3 border-t pt-3"
					>
						<p className="text-sm font-medium">Who showed up?</p>
						<div className="grid gap-2 sm:grid-cols-2">
							{members.map((member) => {
								const row = event.attendance.find((a) => a.userId === member.id);
								const defaultChecked = row?.attended ?? row?.rsvp === "yes";
								return (
									<label key={member.id} className="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											name="attended"
											value={member.id}
											defaultChecked={defaultChecked}
											className="accent-primary size-4"
										/>
										{member.name}
									</label>
								);
							})}
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="flex flex-col gap-1.5 text-sm">
								What did you play?
								<select
									name="gameId"
									defaultValue={event.gameId ?? ""}
									className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
								>
									<option value="">none / undecided</option>
									{wrapUpGames.map((game) => (
										<option key={game.id} value={game.id}>
											{game.title}
										</option>
									))}
								</select>
							</label>
							<label className="flex flex-col gap-1.5 text-sm">
								How did it go?
								<select
									name="howItWent"
									defaultValue={event.howItWent ?? ""}
									className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
								>
									<option value="">no rating</option>
									<option value="5">5 — a blast</option>
									<option value="4">4 — great</option>
									<option value="3">3 — solid</option>
									<option value="2">2 — meh</option>
									<option value="1">1 — rough</option>
								</select>
							</label>
						</div>
						<textarea
							name="recap"
							rows={2}
							maxLength={5000}
							defaultValue={event.recap ?? ""}
							placeholder="Recap (optional) — what happened, highlights, who won…"
							className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
						/>
						<textarea
							name="progressNote"
							rows={2}
							maxLength={2000}
							defaultValue={event.progressNote ?? ""}
							placeholder="Where we left off (optional) — for a campaign next time…"
							className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
						/>
						<label className="flex items-center gap-2 text-sm">
							<input type="checkbox" name="scheduleNext" value="1" className="accent-primary size-4" />
							Schedule the next session — same time next week
						</label>
						<div className="flex flex-wrap items-center gap-2">
							<Button size="sm">Save attendance & complete</Button>
							<Button size="sm" variant="ghost" formAction={cancelEvent.bind(null, event.id)}>
								It never happened
							</Button>
						</div>
					</form>
				)}
			</CardContent>
		</Card>
	);
}
