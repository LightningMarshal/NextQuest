// Read-side assembly for session pages (server-only, NOT "use server").
// Visibility is applied HERE, in the query, for every list: guests only
// ever receive open sessions — a page can't forget to filter.

import { and, asc, desc, eq, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb, schema } from "@/db";
import { canSeeSession, type RosterEntry } from "@/lib/sessions";
import type { SessionUser } from "@/server/session";

export type SessionCardData = {
	id: string;
	title: string;
	status: "scheduled" | "completed" | "cancelled";
	visibility: "members" | "open";
	scheduledAt: Date;
	durationMinutes: number | null;
	capacity: number | null;
	location: string | null;
	joinUrl: string | null;
	venue: "virtual" | "in_person" | "hybrid" | null;
	notes: string | null;
	recap: string | null;
	howItWent: number | null;
	progressNote: string | null;
	autoClosed: boolean;
	sessionNumber: number | null;
	createdBy: string | null;
	hostName: string | null;
	gameId: string | null;
	gameTitle: string | null;
	gameType: "video" | "ttrpg" | "boardgame" | null;
	art: string | null;
	roster: RosterEntry[];
};

const host = alias(schema.user, "host_user");

function visibilityFilter(viewer: SessionUser): SQL | undefined {
	return canSeeSession("members", viewer) ? undefined : eq(schema.events.visibility, "open");
}

async function selectSessions(viewer: SessionUser, where: SQL | undefined, order: SQL[], limit: number) {
	const db = getDb();
	const rows = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			status: schema.events.status,
			visibility: schema.events.visibility,
			scheduledAt: schema.events.scheduledAt,
			durationMinutes: schema.events.durationMinutes,
			capacity: schema.events.capacity,
			location: schema.events.location,
			joinUrl: schema.events.joinUrl,
			venue: schema.events.venue,
			notes: schema.events.notes,
			recap: schema.events.recap,
			howItWent: schema.events.howItWent,
			progressNote: schema.events.progressNote,
			autoClosed: schema.events.autoClosed,
			sessionNumber: schema.events.sessionNumber,
			createdBy: schema.events.createdBy,
			hostName: host.name,
			gameId: schema.events.gameId,
			gameTitle: schema.games.title,
			gameType: schema.games.gameType,
			headerUrl: schema.gameMetadata.headerUrl,
			coverUrl: schema.gameMetadata.coverUrl,
		})
		.from(schema.events)
		.leftJoin(host, eq(schema.events.createdBy, host.id))
		.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
		.leftJoin(schema.gameMetadata, eq(schema.events.gameId, schema.gameMetadata.gameId))
		.where(and(visibilityFilter(viewer), where))
		.orderBy(...order)
		.limit(limit);
	return withRosters(rows);
}

async function withRosters<
	T extends { id: string; headerUrl: string | null; coverUrl: string | null },
>(rows: T[]): Promise<(Omit<T, "headerUrl" | "coverUrl"> & { art: string | null; roster: RosterEntry[] })[]> {
	const ids = rows.map((row) => row.id);
	const people =
		ids.length === 0
			? []
			: await getDb()
					.select({
						eventId: schema.eventAttendance.eventId,
						userId: schema.eventAttendance.userId,
						name: schema.user.name,
						image: schema.user.image,
						role: schema.user.role,
						rsvp: schema.eventAttendance.rsvp,
						attended: schema.eventAttendance.attended,
					})
					.from(schema.eventAttendance)
					.innerJoin(schema.user, eq(schema.eventAttendance.userId, schema.user.id))
					.where(inArray(schema.eventAttendance.eventId, ids))
					.orderBy(asc(schema.eventAttendance.respondedAt));
	return rows.map(({ headerUrl, coverUrl, ...row }) => ({
		...row,
		art: headerUrl ?? coverUrl,
		roster: people
			.filter((person) => person.eventId === row.id)
			.map((person) => ({
				userId: person.userId,
				name: person.name,
				image: person.image,
				rsvp: person.rsvp,
				attended: person.attended,
				isGuest: person.role === "guest",
			})),
	}));
}

const LIVE_WINDOW = sql`${schema.events.scheduledAt} + make_interval(mins => coalesce(${schema.events.durationMinutes}, 180))`;

export type HomeData = {
	/** Scheduled and not yet over: live now or upcoming, soonest first. */
	upcoming: SessionCardData[];
	/** Over but not wrapped up, that this viewer can close out. */
	needsWrapUp: SessionCardData[];
	recent: SessionCardData[];
};

export async function getHomeData(viewer: SessionUser, now: Date): Promise<HomeData> {
	const isMember = canSeeSession("members", viewer);
	const [upcoming, ended, recent] = await Promise.all([
		selectSessions(
			viewer,
			and(eq(schema.events.status, "scheduled"), sql`${LIVE_WINDOW} > ${now}`),
			[asc(schema.events.scheduledAt)],
			24
		),
		isMember
			? selectSessions(
					viewer,
					and(eq(schema.events.status, "scheduled"), sql`${LIVE_WINDOW} <= ${now}`),
					[desc(schema.events.scheduledAt)],
					10
				)
			: Promise.resolve([]),
		selectSessions(viewer, eq(schema.events.status, "completed"), [desc(schema.events.scheduledAt)], 4),
	]);
	// Wrap-up prompts go to whoever can act: host, admin, or someone who was in.
	const needsWrapUp = ended.filter(
		(session) =>
			viewer.role === "admin" ||
			session.createdBy === viewer.id ||
			session.roster.some((entry) => entry.userId === viewer.id && entry.rsvp === "yes")
	);
	return { upcoming, needsWrapUp, recent };
}

export type SessionsPage = {
	upcoming: SessionCardData[];
	past: SessionCardData[];
	hasMorePast: boolean;
};

const PAST_PAGE_SIZE = 20;

export async function getSessionsPage(viewer: SessionUser, now: Date, page: number): Promise<SessionsPage> {
	const [upcoming, past] = await Promise.all([
		selectSessions(
			viewer,
			and(eq(schema.events.status, "scheduled"), sql`${LIVE_WINDOW} > ${now}`),
			[asc(schema.events.scheduledAt)],
			100
		),
		selectSessions(
			viewer,
			or(
				inArray(schema.events.status, ["completed", "cancelled"]),
				and(eq(schema.events.status, "scheduled"), sql`${LIVE_WINDOW} <= ${now}`)
			),
			[desc(schema.events.scheduledAt)],
			PAST_PAGE_SIZE * (page + 1) + 1
		),
	]);
	const start = PAST_PAGE_SIZE * page;
	return {
		upcoming,
		past: past.slice(start, start + PAST_PAGE_SIZE),
		hasMorePast: past.length > start + PAST_PAGE_SIZE,
	};
}

export type SessionDetail = SessionCardData & {
	gameGenres: string[] | null;
	gameDescription: string | null;
	gameStatus: (typeof schema.gameStatus.enumValues)[number] | null;
	/** "Where we left off" from the last wrapped-up session of the same game. */
	lastTime: { scheduledAt: Date; progressNote: string } | null;
	wrappedUpByName: string | null;
	createdAt: Date;
};

/** One session, or null if missing OR not visible to this viewer (same answer). */
export async function getSessionDetail(viewer: SessionUser, id: string): Promise<SessionDetail | null> {
	const db = getDb();
	const wrapper = alias(schema.user, "wrapper_user");
	const [row] = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			status: schema.events.status,
			visibility: schema.events.visibility,
			scheduledAt: schema.events.scheduledAt,
			durationMinutes: schema.events.durationMinutes,
			capacity: schema.events.capacity,
			location: schema.events.location,
			joinUrl: schema.events.joinUrl,
			venue: schema.events.venue,
			notes: schema.events.notes,
			recap: schema.events.recap,
			howItWent: schema.events.howItWent,
			progressNote: schema.events.progressNote,
			autoClosed: schema.events.autoClosed,
			sessionNumber: schema.events.sessionNumber,
			createdBy: schema.events.createdBy,
			createdAt: schema.events.createdAt,
			hostName: host.name,
			wrappedUpByName: wrapper.name,
			gameId: schema.events.gameId,
			gameTitle: schema.games.title,
			gameType: schema.games.gameType,
			gameStatus: schema.games.status,
			headerUrl: schema.gameMetadata.headerUrl,
			coverUrl: schema.gameMetadata.coverUrl,
			gameGenres: schema.gameMetadata.genres,
			gameDescription: schema.gameMetadata.description,
		})
		.from(schema.events)
		.leftJoin(host, eq(schema.events.createdBy, host.id))
		.leftJoin(wrapper, eq(schema.events.wrappedUpBy, wrapper.id))
		.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
		.leftJoin(schema.gameMetadata, eq(schema.events.gameId, schema.gameMetadata.gameId))
		.where(and(eq(schema.events.id, id), visibilityFilter(viewer)));
	if (!row) return null;

	const [[withRoster], lastTimeRows] = await Promise.all([
		withRosters([row]),
		row.gameId
			? db
					.select({ scheduledAt: schema.events.scheduledAt, progressNote: schema.events.progressNote })
					.from(schema.events)
					.where(
						and(
							eq(schema.events.gameId, row.gameId),
							eq(schema.events.status, "completed"),
							sql`${schema.events.progressNote} is not null`,
							sql`${schema.events.id} <> ${id}`,
							lte(schema.events.scheduledAt, row.scheduledAt)
						)
					)
					.orderBy(desc(schema.events.scheduledAt))
					.limit(1)
			: Promise.resolve([]),
	]);
	const last = lastTimeRows[0];
	return {
		...withRoster,
		lastTime: last?.progressNote ? { scheduledAt: last.scheduledAt, progressNote: last.progressNote } : null,
	};
}

/** Library games for the composer's game picker (members only). */
export async function getPickableGames(): Promise<
	{ id: string; title: string; status: (typeof schema.gameStatus.enumValues)[number] }[]
> {
	return getDb()
		.select({ id: schema.games.id, title: schema.games.title, status: schema.games.status })
		.from(schema.games)
		.where(inArray(schema.games.status, ["playing", "backlog", "proposed", "completed", "abandoned"]))
		.orderBy(
			sql`case ${schema.games.status} when 'playing' then 0 when 'backlog' then 1 when 'proposed' then 2 else 3 end`,
			asc(schema.games.title)
		);
}

/** Open availability polls — a nudge on the home page for members. */
export async function getOpenPolls(): Promise<{ id: string; title: string; closesAt: Date | null }[]> {
	return getDb()
		.select({
			id: schema.availabilityPolls.id,
			title: schema.availabilityPolls.title,
			closesAt: schema.availabilityPolls.closesAt,
		})
		.from(schema.availabilityPolls)
		.where(eq(schema.availabilityPolls.status, "open"))
		.orderBy(desc(schema.availabilityPolls.createdAt))
		.limit(3);
}


