// Build Discord messages for the walkthrough with the app's REAL embed
// builder (src/lib/discord-embed.ts) and reminder wording, from the session
// as it is in the database right now. The capture script calls this after
// each RSVP so the on-screen card matches what Discord would show.
//
//   npx tsx promo/walkthrough/capture/discord-embeds.ts <sessionId> > embed.json
import "dotenv/config";

import { neon, neonConfig } from "@neondatabase/serverless";

import { buildSessionEmbed, type AnnouncedSession } from "@/lib/discord-embed";

const sessionId = process.argv[2];
// Same local route as the promo seed: Neon's HTTP driver through the shim.
neonConfig.fetchEndpoint = process.env.NEON_HTTP_PROXY_ENDPOINT ?? "http://127.0.0.1:4445/sql";
const sql = neon(process.env.DATABASE_URL ?? "postgresql://postgres@localhost:5433/nextquest");

async function main() {
	const rows = await sql.query(
		`select e.id, e.title, e.status, e.visibility, e.scheduled_at, e.duration_minutes, e.location, e.join_url, e.notes,
		        e.capacity, e.how_it_went, e.recap, g.title as game_title, coalesce(m.header_url, m.cover_url) as art, h.name as host_name
		   from events e
		   left join games g on g.id = e.game_id
		   left join game_metadata m on m.game_id = e.game_id
		   left join "user" h on h.id = e.created_by
		  where e.id = $1`,
		[sessionId],
	);
	const e = rows[0];
	const roster = await sql.query(
		`select u.name, a.rsvp, a.attended from event_attendance a join "user" u on u.id = a.user_id
		  where a.event_id = $1 order by a.responded_at`,
		[sessionId],
	);
	const session: AnnouncedSession = {
		id: e.id,
		title: e.title,
		status: e.status,
		visibility: e.visibility,
		scheduledAt: new Date(e.scheduled_at),
		durationMinutes: e.duration_minutes,
		gameTitle: e.game_title,
		art: e.art,
		hostName: e.host_name,
		location: e.location,
		joinUrl: e.join_url,
		notes: e.notes,
		capacity: e.capacity,
		going: roster.filter((r) => r.rsvp === "yes").map((r) => r.name),
		maybe: roster.filter((r) => r.rsvp === "maybe").map((r) => r.name),
		came: roster.filter((r) => r.attended).map((r) => r.name),
		howItWent: e.how_it_went,
		recap: e.recap,
	};
	const embed = buildSessionEmbed(session, process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
	// The 1-hour reminder, worded exactly as src/server/cron/event-reminders.ts sends it.
	const who = session.going.length === 0 ? "nobody's in yet" : `in${session.capacity !== null ? ` (${session.going.length}/${session.capacity})` : ""}: ${session.going.join(", ")}`;
	const reminder = `⏰ **${session.title}** starts <t:${Math.floor(session.scheduledAt.getTime() / 1000)}:R> — ${who}. Hop in: ${embed.url}`;
	process.stdout.write(JSON.stringify({ embed, reminder, scheduledAt: session.scheduledAt.toISOString() }));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
