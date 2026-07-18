// Read-side assembly for /members/[userId] (server-only, not a server
// action — callers sit behind the (app) layout's requireApprovedUser gate,
// same as dashboard.ts / pick.ts).
//
// ANONYMITY INVARIANT: this surface must never touch the votes table. A
// member's history is what they proposed, played, and ran — their ballot is
// nobody's business, including the admins'.

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

export type MemberProfile = {
	id: string;
	name: string;
	image: string | null;
	role: "admin" | "member";
	status: "pending" | "approved" | "rejected";
	memberSince: Date;
};

export type MemberHistory = {
	profile: MemberProfile;
	stats: {
		proposals: number;
		/** Of those proposals, how many the group finished. */
		proposalsFinished: number;
		sessionsAttended: number;
		/** Completed events overall — the denominator for attendance. */
		completedEventCount: number;
	};
	proposals: {
		id: string;
		title: string;
		gameType: "video" | "ttrpg" | "boardgame";
		status: (typeof schema.gameStatus.enumValues)[number];
		effort: number | null;
		createdAt: Date;
	}[];
	/** Completed sessions this member attended, most recent first. */
	sessions: {
		id: string;
		title: string;
		scheduledAt: Date;
		sessionNumber: number | null;
		gameTitle: string | null;
		howItWent: number | null;
	}[];
	/** Upcoming sessions they've said yes/maybe to. */
	upcoming: {
		id: string;
		title: string;
		scheduledAt: Date;
		rsvp: "yes" | "no" | "maybe";
	}[];
	/** Tabletop games where they're the GM/facilitator. */
	runs: {
		id: string;
		title: string;
		status: (typeof schema.gameStatus.enumValues)[number];
		system: string | null;
	}[];
};

export async function getMemberHistory(userId: string): Promise<MemberHistory | null> {
	const db = getDb();

	const profileRows = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			image: schema.user.image,
			role: schema.user.role,
			status: schema.user.status,
			memberSince: schema.user.createdAt,
		})
		.from(schema.user)
		.where(eq(schema.user.id, userId));
	const profile = profileRows[0];
	if (!profile) return null;

	const effectivePoints = sql<number | null>`coalesce(${schema.games.pointsOverride}, ${schema.games.points})`;

	const [proposals, sessions, upcoming, runs, completedEvents] = await Promise.all([
		db
			.select({
				id: schema.games.id,
				title: schema.games.title,
				gameType: schema.games.gameType,
				status: schema.games.status,
				effort: effectivePoints,
				createdAt: schema.games.createdAt,
			})
			.from(schema.games)
			.where(eq(schema.games.proposedBy, userId))
			.orderBy(desc(schema.games.createdAt)),
		db
			.select({
				id: schema.events.id,
				title: schema.events.title,
				scheduledAt: schema.events.scheduledAt,
				sessionNumber: schema.events.sessionNumber,
				gameTitle: schema.games.title,
				howItWent: schema.events.howItWent,
			})
			.from(schema.eventAttendance)
			.innerJoin(schema.events, eq(schema.eventAttendance.eventId, schema.events.id))
			.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
			.where(
				and(
					eq(schema.eventAttendance.userId, userId),
					eq(schema.eventAttendance.attended, true),
					eq(schema.events.status, "completed")
				)
			)
			.orderBy(desc(schema.events.scheduledAt)),
		db
			.select({
				id: schema.events.id,
				title: schema.events.title,
				scheduledAt: schema.events.scheduledAt,
				rsvp: schema.eventAttendance.rsvp,
			})
			.from(schema.eventAttendance)
			.innerJoin(schema.events, eq(schema.eventAttendance.eventId, schema.events.id))
			.where(
				and(
					eq(schema.eventAttendance.userId, userId),
					eq(schema.events.status, "scheduled"),
					sql`${schema.events.scheduledAt} > now()`,
					sql`${schema.eventAttendance.rsvp} in ('yes', 'maybe')`
				)
			)
			.orderBy(schema.events.scheduledAt),
		db
			.select({
				id: schema.games.id,
				title: schema.games.title,
				status: schema.games.status,
				system: schema.tabletopDetails.system,
			})
			.from(schema.tabletopDetails)
			.innerJoin(schema.games, eq(schema.tabletopDetails.gameId, schema.games.id))
			.where(eq(schema.tabletopDetails.gmUserId, userId))
			.orderBy(desc(schema.games.createdAt)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(schema.events)
			.where(eq(schema.events.status, "completed")),
	]);

	return {
		profile: {
			...profile,
			role: profile.role as MemberProfile["role"],
			status: profile.status as MemberProfile["status"],
		},
		stats: {
			proposals: proposals.length,
			proposalsFinished: proposals.filter((game) => game.status === "completed").length,
			sessionsAttended: sessions.length,
			completedEventCount: completedEvents[0]?.count ?? 0,
		},
		proposals,
		sessions,
		upcoming: upcoming.map((row) => ({ ...row, rsvp: row.rsvp ?? "maybe" })),
		runs,
	};
}
