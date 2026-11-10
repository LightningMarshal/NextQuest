import { asc, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { toCsv, type CsvValue } from "@/lib/export";
import { buildSnapshot } from "@/server/export-read";
import { getSessionUser } from "@/server/session";

// Data export (Phase 20): the group's history is the app's most precious
// data — this is its way out. Admin-only (exports include member emails),
// gated by the normal session, not a token: downloads happen in a signed-in
// browser, unlike the calendar feed.
//
// ANONYMITY INVARIANT: votes leave ONLY as {gameId, totalWeight} aggregates.
// No per-member ballot ever crosses this boundary, in any format.
//
// GET /api/export                      → full JSON snapshot
// GET /api/export?format=csv&table=games|history|events|attendance → one CSV

export const dynamic = "force-dynamic";

const CSV_TABLES = ["games", "history", "events", "attendance"] as const;
type CsvTable = (typeof CSV_TABLES)[number];

function attachment(body: string, contentType: string, filename: string): Response {
	return new Response(body, {
		headers: {
			"content-type": contentType,
			"content-disposition": `attachment; filename="${filename}"`,
			"cache-control": "no-store",
		},
	});
}

export async function GET(request: Request): Promise<Response> {
	const user = await getSessionUser();
	if (!user) return new Response("unauthorized", { status: 401 });
	if (user.status !== "approved" || user.role !== "admin") {
		return new Response("forbidden", { status: 403 });
	}

	const url = new URL(request.url);
	const stamp = new Date().toISOString().slice(0, 10);

	if (url.searchParams.get("format") === "csv") {
		const table = url.searchParams.get("table") as CsvTable | null;
		if (!table || !CSV_TABLES.includes(table)) {
			return new Response(`unknown table — use one of: ${CSV_TABLES.join(", ")}`, {
				status: 400,
			});
		}
		const csv = await buildCsv(table);
		return attachment(csv, "text/csv; charset=utf-8", `nextquest-${table}-${stamp}.csv`);
	}

	const snapshot = await buildSnapshot();
	return attachment(
		JSON.stringify(snapshot, null, "\t"),
		"application/json",
		`nextquest-export-${stamp}.json`
	);
}

async function buildCsv(table: CsvTable): Promise<string> {
	const db = getDb();
	const proposer = schema.user;

	switch (table) {
		case "games": {
			const rows = await db
				.select({
					id: schema.games.id,
					title: schema.games.title,
					gameType: schema.games.gameType,
					status: schema.games.status,
					proposedBy: proposer.name,
					pitch: schema.games.pitch,
					lengthHours: schema.games.lengthHours,
					difficulty: schema.games.difficulty,
					points: schema.games.points,
					pointsOverride: schema.games.pointsOverride,
					startedAt: schema.games.startedAt,
					completedAt: schema.games.completedAt,
					createdAt: schema.games.createdAt,
				})
				.from(schema.games)
				.leftJoin(proposer, eq(schema.games.proposedBy, proposer.id))
				.orderBy(asc(schema.games.createdAt));
			return toCsv(
				[
					"id",
					"title",
					"type",
					"status",
					"proposed_by",
					"pitch",
					"length_hours",
					"difficulty",
					"points",
					"points_override",
					"started_at",
					"completed_at",
					"created_at",
				],
				rows.map((row) => Object.values(row) as CsvValue[])
			);
		}
		case "history": {
			const rows = await db
				.select({
					changedAt: schema.gameStatusHistory.changedAt,
					gameTitle: schema.games.title,
					fromStatus: schema.gameStatusHistory.fromStatus,
					toStatus: schema.gameStatusHistory.toStatus,
					changedBy: schema.user.name,
				})
				.from(schema.gameStatusHistory)
				.innerJoin(schema.games, eq(schema.gameStatusHistory.gameId, schema.games.id))
				.leftJoin(schema.user, eq(schema.gameStatusHistory.changedBy, schema.user.id))
				.orderBy(asc(schema.gameStatusHistory.changedAt));
			return toCsv(
				["changed_at", "game", "from_status", "to_status", "changed_by"],
				rows.map((row) => Object.values(row) as CsvValue[])
			);
		}
		case "events": {
			const rows = await db
				.select({
					scheduledAt: schema.events.scheduledAt,
					title: schema.events.title,
					status: schema.events.status,
					sessionNumber: schema.events.sessionNumber,
					venue: schema.events.venue,
					location: schema.events.location,
					gameTitle: schema.games.title,
					durationMinutes: schema.events.durationMinutes,
					howItWent: schema.events.howItWent,
					recap: schema.events.recap,
					progressNote: schema.events.progressNote,
					createdBy: schema.user.name,
				})
				.from(schema.events)
				.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
				.leftJoin(schema.user, eq(schema.events.createdBy, schema.user.id))
				.orderBy(asc(schema.events.scheduledAt));
			return toCsv(
				[
					"scheduled_at",
					"title",
					"status",
					"session_number",
					"venue",
					"location",
					"game",
					"duration_minutes",
					"how_it_went",
					"recap",
					"progress_note",
					"created_by",
				],
				rows.map((row) => Object.values(row) as CsvValue[])
			);
		}
		case "attendance": {
			const rows = await db
				.select({
					scheduledAt: schema.events.scheduledAt,
					eventTitle: schema.events.title,
					member: schema.user.name,
					rsvp: schema.eventAttendance.rsvp,
					attended: schema.eventAttendance.attended,
				})
				.from(schema.eventAttendance)
				.innerJoin(schema.events, eq(schema.eventAttendance.eventId, schema.events.id))
				.innerJoin(schema.user, eq(schema.eventAttendance.userId, schema.user.id))
				.orderBy(asc(schema.events.scheduledAt), asc(schema.user.name));
			return toCsv(
				["scheduled_at", "event", "member", "rsvp", "attended"],
				rows.map((row) => Object.values(row) as CsvValue[])
			);
		}
	}
}
