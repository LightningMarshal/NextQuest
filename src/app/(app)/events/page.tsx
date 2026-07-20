import type { Metadata } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { bestWindows, type Interval } from "@/lib/availability-grid";
import { deriveCalendarToken } from "@/lib/ical";
import { requireApprovedUser } from "@/server/session";

import { AvailabilityGridCard } from "./availability-grid-card";
import { CalendarSubscribe } from "./calendar-subscribe";
import { CreateEventForm } from "./create-event-form";
import { CreatePollForm } from "./create-poll-form";
import { EventCard, type EventWithDetails } from "./event-card";
import { PollCard, type PollWithSlots } from "./poll-card";

export const metadata: Metadata = { title: "Events" };

// Plain helper, not a component: Date.now() here keeps render pure per the
// react-hooks purity rules (this is an RSC, evaluated once per request).
function partitionEvents(events: EventWithDetails[]) {
	const now = Date.now();
	return {
		upcoming: events.filter(
			(event) => event.status === "scheduled" && event.scheduledAt.getTime() > now
		),
		needsWrapUp: events.filter(
			(event) => event.status === "scheduled" && event.scheduledAt.getTime() <= now
		),
		past: events
			.filter((event) => event.status !== "scheduled")
			.sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
			.slice(0, 10),
	};
}

export default async function EventsPage({
	searchParams,
}: {
	searchParams: Promise<{ game?: string }>;
}) {
	const user = await requireApprovedUser();
	const db = getDb();
	// "Plan a session with this game" deep link from a game card/page (#34).
	const { game: preselectedGameId } = await searchParams;

	// iCal feed URL (issue #24): token derived from the auth secret, base from
	// the canonical app URL. Both unset only in a broken deployment — the
	// subscribe card simply doesn't render then.
	const { env } = getCloudflareContext() as {
		env: { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
	};
	const calendarUrl =
		env.BETTER_AUTH_SECRET && env.BETTER_AUTH_URL
			? `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api/calendar?token=${await deriveCalendarToken(env.BETTER_AUTH_SECRET)}`
			: null;

	const creator = schema.user;
	const [eventRows, members, candidateGames] = await Promise.all([
		db
			.select({
				id: schema.events.id,
				title: schema.events.title,
				status: schema.events.status,
				scheduledAt: schema.events.scheduledAt,
				durationMinutes: schema.events.durationMinutes,
				venue: schema.events.venue,
				location: schema.events.location,
				notes: schema.events.notes,
				recap: schema.events.recap,
				howItWent: schema.events.howItWent,
				progressNote: schema.events.progressNote,
				gameId: schema.events.gameId,
				gameTitle: schema.games.title,
				creatorName: creator.name,
			})
			.from(schema.events)
			.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
			.leftJoin(creator, eq(schema.events.createdBy, creator.id))
			.orderBy(asc(schema.events.scheduledAt)),
		db
			.select({ id: schema.user.id, name: schema.user.name })
			.from(schema.user)
			.where(eq(schema.user.status, "approved"))
			.orderBy(asc(schema.user.name)),
		// Every game, in-rotation first — planning usually wants playing/backlog,
		// but wrap-ups can point at anything the group actually played (#32).
		db
			.select({
				id: schema.games.id,
				title: schema.games.title,
				status: schema.games.status,
			})
			.from(schema.games)
			.orderBy(
				sql`case ${schema.games.status}
					when 'playing' then 0 when 'backlog' then 1 when 'proposed' then 2
					when 'completed' then 3 when 'abandoned' then 4 else 5 end`,
				asc(schema.games.title)
			),
	]);

	// Attendance is public within the group (unlike votes) — names and all.
	const attendanceRows =
		eventRows.length === 0
			? []
			: await db
					.select({
						eventId: schema.eventAttendance.eventId,
						userId: schema.eventAttendance.userId,
						rsvp: schema.eventAttendance.rsvp,
						attended: schema.eventAttendance.attended,
						name: schema.user.name,
					})
					.from(schema.eventAttendance)
					.innerJoin(schema.user, eq(schema.eventAttendance.userId, schema.user.id))
					.where(
						inArray(
							schema.eventAttendance.eventId,
							eventRows.map((event) => event.id)
						)
					);

	const events: EventWithDetails[] = eventRows.map((event) => ({
		...event,
		attendance: attendanceRows
			.filter((row) => row.eventId === event.id)
			.map(({ userId, name, rsvp, attended }) => ({ userId, name, rsvp, attended })),
	}));

	const { upcoming, needsWrapUp, past } = partitionEvents(events);

	// GAC polls: all open ones plus a few recently closed for context.
	const pollCreator = schema.user;
	const pollRows = await db
		.select({
			id: schema.availabilityPolls.id,
			title: schema.availabilityPolls.title,
			kind: schema.availabilityPolls.kind,
			gridSessionMinutes: schema.availabilityPolls.gridSessionMinutes,
			status: schema.availabilityPolls.status,
			createdAt: schema.availabilityPolls.createdAt,
			creatorName: pollCreator.name,
		})
		.from(schema.availabilityPolls)
		.leftJoin(pollCreator, eq(schema.availabilityPolls.createdBy, pollCreator.id))
		.orderBy(asc(schema.availabilityPolls.status), desc(schema.availabilityPolls.createdAt));
	const visiblePolls = [
		...pollRows.filter((poll) => poll.status === "open"),
		...pollRows.filter((poll) => poll.status === "closed").slice(0, 3),
	];

	const pollIds = visiblePolls.map((poll) => poll.id);
	const [optionRows, scheduledFromPoll] = await Promise.all([
		pollIds.length === 0
			? Promise.resolve([])
			: db
					.select({
						id: schema.availabilityOptions.id,
						pollId: schema.availabilityOptions.pollId,
						startsAt: schema.availabilityOptions.startsAt,
						endsAt: schema.availabilityOptions.endsAt,
					})
					.from(schema.availabilityOptions)
					.where(inArray(schema.availabilityOptions.pollId, pollIds))
					.orderBy(asc(schema.availabilityOptions.startsAt)),
		pollIds.length === 0
			? Promise.resolve([])
			: db
					.select({ pollId: schema.events.availabilityPollId })
					.from(schema.events)
					.where(
						inArray(
							schema.events.availabilityPollId,
							pollIds
						)
					),
	]);

	const responseRows =
		optionRows.length === 0
			? []
			: await db
					.select({
						optionId: schema.availabilityResponses.optionId,
						userId: schema.availabilityResponses.userId,
						response: schema.availabilityResponses.response,
						name: schema.user.name,
					})
					.from(schema.availabilityResponses)
					.innerJoin(schema.user, eq(schema.availabilityResponses.userId, schema.user.id))
					.where(
						inArray(
							schema.availabilityResponses.optionId,
							optionRows.map((option) => option.id)
						)
					);

	// Grid polls (issue #33): painted marks with names, for the heatmap and
	// the server-computed best-window suggestions. Availability is public.
	const gridPollIds = visiblePolls.filter((poll) => poll.kind === "grid").map((poll) => poll.id);
	const markRows =
		gridPollIds.length === 0
			? []
			: await db
					.select({
						pollId: schema.availabilityMarks.pollId,
						userId: schema.availabilityMarks.userId,
						startsAt: schema.availabilityMarks.startsAt,
						endsAt: schema.availabilityMarks.endsAt,
						name: schema.user.name,
					})
					.from(schema.availabilityMarks)
					.innerJoin(schema.user, eq(schema.availabilityMarks.userId, schema.user.id))
					.where(inArray(schema.availabilityMarks.pollId, gridPollIds));

	const scheduledPollIds = new Set(scheduledFromPoll.map((row) => row.pollId));
	const polls: PollWithSlots[] = visiblePolls
		.filter((poll) => poll.kind === "slots")
		.map((poll) => ({
			id: poll.id,
			title: poll.title,
			status: poll.status,
			creatorName: poll.creatorName,
			scheduled: scheduledPollIds.has(poll.id),
			slots: optionRows
				.filter((option) => option.pollId === poll.id)
				.map((option) => ({
					id: option.id,
					startsAt: option.startsAt,
					endsAt: option.endsAt,
					responses: responseRows
						.filter((row) => row.optionId === option.id)
						.map(({ userId, name, response }) => ({ userId, name, response })),
				})),
		}));

	const gridPolls = visiblePolls
		.filter((poll) => poll.kind === "grid")
		.map((poll) => {
			const windows = optionRows
				.filter((option) => option.pollId === poll.id)
				.map((option) => ({ startsAt: option.startsAt, endsAt: option.endsAt }));
			const marks = markRows.filter((mark) => mark.pollId === poll.id);
			const byUser = new Map<string, { name: string; intervals: Interval[] }>();
			for (const mark of marks) {
				const entry = byUser.get(mark.userId) ?? { name: mark.name, intervals: [] };
				entry.intervals.push({ startsAt: mark.startsAt, endsAt: mark.endsAt });
				byUser.set(mark.userId, entry);
			}
			const suggestions = bestWindows(
				windows,
				[...byUser.entries()].map(([userId, entry]) => ({ userId, intervals: entry.intervals })),
				poll.gridSessionMinutes ?? 120
			).map((suggestion) => ({
				startIso: suggestion.startsAt.toISOString(),
				endIso: suggestion.endsAt.toISOString(),
				names: suggestion.available.map((userId) => byUser.get(userId)?.name ?? "?"),
			}));
			return {
				id: poll.id,
				title: poll.title,
				creatorName: poll.creatorName,
				open: poll.status === "open",
				scheduled: scheduledPollIds.has(poll.id),
				sessionMinutes: poll.gridSessionMinutes ?? 120,
				windows,
				marks: marks.map(({ userId, name, startsAt, endsAt }) => ({
					userId,
					name,
					startsAt,
					endsAt,
				})),
				suggestions,
			};
		});

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="font-display text-3xl font-semibold tracking-tight">Events</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Schedule sessions, RSVP, and keep the attendance receipts.
				</p>
			</div>

			<CreateEventForm
				games={candidateGames}
				defaultGameId={
					candidateGames.some((game) => game.id === preselectedGameId)
						? preselectedGameId
						: undefined
				}
			/>

			<section className="flex flex-col gap-3">
				<h2 className="text-sm font-medium tracking-wide uppercase">Find a time</h2>
				{gridPolls.map((poll) => (
					<AvailabilityGridCard
						key={poll.id}
						pollId={poll.id}
						title={poll.title}
						creatorName={poll.creatorName}
						open={poll.open}
						scheduled={poll.scheduled}
						sessionMinutes={poll.sessionMinutes}
						windows={poll.windows}
						marks={poll.marks}
						currentUserId={user.id}
						memberCount={members.length}
						suggestions={poll.suggestions}
					/>
				))}
				{/* Pre-grid slot polls (and their history) still render. */}
				{polls.map((poll) => (
					<PollCard key={poll.id} poll={poll} currentUserId={user.id} />
				))}
				<CreatePollForm />
			</section>

			{needsWrapUp.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="text-sm font-medium tracking-wide uppercase">Needs wrap-up</h2>
					{needsWrapUp.map((event) => (
						<EventCard
							key={event.id}
							event={event}
							currentUserId={user.id}
							members={members}
							candidateGames={candidateGames}
							needsWrapUp
						/>
					))}
				</section>
			)}

			<section className="flex flex-col gap-3">
				<h2 className="text-sm font-medium tracking-wide uppercase">
					Upcoming
					<span className="stat text-muted-foreground ml-2 font-normal">{upcoming.length}</span>
				</h2>
				{upcoming.length === 0 ? (
					<p className="text-muted-foreground text-sm">Nothing on the calendar.</p>
				) : (
					<div className="grid items-stretch gap-4 sm:grid-cols-2">
						{upcoming.map((event) => (
							<EventCard key={event.id} event={event} currentUserId={user.id} members={members} />
						))}
					</div>
				)}
			</section>

			{past.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="text-sm font-medium tracking-wide uppercase">Past</h2>
					<div className="grid items-stretch gap-4 sm:grid-cols-2">
						{past.map((event) => (
							<EventCard key={event.id} event={event} currentUserId={user.id} members={members} />
						))}
					</div>
				</section>
			)}

			{calendarUrl && <CalendarSubscribe url={calendarUrl} />}
		</div>
	);
}
