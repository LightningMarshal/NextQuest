import type { Metadata } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { deriveCalendarToken } from "@/lib/ical";
import { requireApprovedUser } from "@/server/session";

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

export default async function EventsPage() {
	const user = await requireApprovedUser();
	const db = getDb();

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
		// Sessions are usually for what's being played or queued next.
		db
			.select({ id: schema.games.id, title: schema.games.title })
			.from(schema.games)
			.where(inArray(schema.games.status, ["playing", "backlog"]))
			.orderBy(sql`${schema.games.status} = 'playing' desc`, asc(schema.games.title)),
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

	const scheduledPollIds = new Set(scheduledFromPoll.map((row) => row.pollId));
	const polls: PollWithSlots[] = visiblePolls.map((poll) => ({
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

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="font-display text-3xl font-semibold tracking-tight">Events</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Schedule sessions, RSVP, and keep the attendance receipts.
				</p>
			</div>

			<CreateEventForm games={candidateGames} />

			<section className="flex flex-col gap-3">
				<h2 className="text-sm font-medium tracking-wide uppercase">Find a time</h2>
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
