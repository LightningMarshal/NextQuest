import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeftIcon } from "lucide-react";

import { getDb, schema } from "@/db";
import { bestWindows, type Interval } from "@/lib/availability-grid";
import { requireMember } from "@/server/session";
import { getPickableGames } from "@/server/sessions-read";

import { AvailabilityGridCard } from "./availability-grid-card";
import { CreatePollForm } from "./create-poll-form";
import { PollCard, type PollWithSlots } from "./poll-card";

export const metadata: Metadata = { title: "Find a time" };

// Planning ahead: find-a-time polls (GAC). Moved here from the old events
// page so the sessions list stays about sessions. Members only.

// Closed polls drop from view a week after closing (#37) — history stays in
// the database, the page just stops carrying it. Plain helper (not a
// component) so Date.now() keeps render pure per the react-hooks rules.
const CLOSED_POLL_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;
function selectVisiblePolls<T extends { status: "open" | "closed"; closedAt: Date | null }>(
	polls: T[]
): T[] {
	const now = Date.now();
	return [
		...polls.filter((poll) => poll.status === "open"),
		...polls
			.filter(
				(poll) =>
					poll.status === "closed" &&
					poll.closedAt !== null &&
					now - poll.closedAt.getTime() < CLOSED_POLL_VISIBLE_MS
			)
			.slice(0, 3),
	];
}

export default async function PlanPage() {
	const user = await requireMember("/sessions/plan");
	const db = getDb();
	const [members, candidateGames] = await Promise.all([
		db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.status, "approved")),
		getPickableGames(),
	]);

	// GAC polls: all open ones plus recently closed for context.
	const pollCreator = schema.user;
	const pollGame = alias(schema.games, "poll_game");
	const pollRows = await db
		.select({
			id: schema.availabilityPolls.id,
			title: schema.availabilityPolls.title,
			kind: schema.availabilityPolls.kind,
			gridSessionMinutes: schema.availabilityPolls.gridSessionMinutes,
			status: schema.availabilityPolls.status,
			createdAt: schema.availabilityPolls.createdAt,
			closedAt: schema.availabilityPolls.closedAt,
			createdBy: schema.availabilityPolls.createdBy,
			gameTitle: pollGame.title,
			creatorName: pollCreator.name,
		})
		.from(schema.availabilityPolls)
		.leftJoin(pollCreator, eq(schema.availabilityPolls.createdBy, pollCreator.id))
		.leftJoin(pollGame, eq(schema.availabilityPolls.gameId, pollGame.id))
		.orderBy(asc(schema.availabilityPolls.status), desc(schema.availabilityPolls.createdAt));
	const canDeletePoll = (poll: { createdBy: string | null }) =>
		poll.createdBy === user.id || user.role === "admin";
	const visiblePolls = selectVisiblePolls(pollRows);

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
			canDelete: canDeletePoll(poll),
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
				gameTitle: poll.gameTitle,
				creatorName: poll.creatorName,
				open: poll.status === "open",
				scheduled: scheduledPollIds.has(poll.id),
				canDelete: canDeletePoll(poll),
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
		<div className="flex flex-col gap-6">
			<Link href="/sessions" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
				<ArrowLeftIcon className="size-4" />
				Sessions
			</Link>
			<div>
				<h1 className="font-display text-3xl font-semibold tracking-tight">Find a time</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					For nights that need planning: everyone paints when they&apos;re free, and the best
					slot becomes a session in one click (RSVPs filled in from the paint).
				</p>
			</div>
			{gridPolls.map((poll) => (
				<div key={poll.id} id={`poll-${poll.id}`}>
					<AvailabilityGridCard
						pollId={poll.id}
						title={poll.title}
						gameTitle={poll.gameTitle}
						creatorName={poll.creatorName}
						open={poll.open}
						scheduled={poll.scheduled}
						canDelete={poll.canDelete}
						sessionMinutes={poll.sessionMinutes}
						windows={poll.windows}
						marks={poll.marks}
						currentUserId={user.id}
						memberCount={members.length}
						suggestions={poll.suggestions}
					/>
				</div>
			))}
			{/* Pre-grid slot polls (and their history) still render. */}
			{polls.map((poll) => (
				<div key={poll.id} id={`poll-${poll.id}`}>
					<PollCard poll={poll} currentUserId={user.id} />
				</div>
			))}
			<CreatePollForm games={candidateGames} />
		</div>
	);
}
