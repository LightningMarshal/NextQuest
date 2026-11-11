// The DB half of the Discord bot's slash commands (server-only, NOT "use
// server"). api/discord/interactions has already verified the request is
// Discord's; everything here starts from the Discord user id and applies
// the same access model as the website: unknown → connect link, unapproved
// → apply, guests see open sessions only and can't post.

import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
	parsePostCommand,
	type CommandData,
	type CommandOutcome,
} from "@/lib/discord-commands";
import { sessionsListText } from "@/lib/discord-commands";
import { resolveOrCreateGame } from "@/server/game-linking";
import { insertSession } from "@/server/session-create";
import { getUpcomingSummaries } from "@/server/sessions-read";

type Db = ReturnType<typeof getDb>;
export type DiscordPerson = { id: string; name: string; role: "admin" | "member" | "guest"; status: string };

/** The NextQuest account a Discord user signed in with or connected. */
export async function findDiscordPerson(db: Db, discordUserId: string): Promise<DiscordPerson | null> {
	const [person] = await db
		.select({ id: schema.user.id, name: schema.user.name, role: schema.user.role, status: schema.user.status })
		.from(schema.account)
		.innerJoin(schema.user, eq(schema.account.userId, schema.user.id))
		.where(and(eq(schema.account.providerId, "discord"), eq(schema.account.accountId, discordUserId)));
	return person ?? null;
}

const isMember = (person: DiscordPerson) => person.role === "member" || person.role === "admin";

/** /sessions — what's coming up, for this viewer. */
export async function runSessionsCommand(discordUserId: string, baseUrl: string): Promise<CommandOutcome> {
	const db = getDb();
	const person = await findDiscordPerson(db, discordUserId);
	if (!person) return { kind: "unlinked" };
	if (person.status !== "approved") return { kind: "not_approved" };
	const sessions = await getUpcomingSummaries(person, new Date(), 15);
	return { kind: "text", text: sessionsListText(sessions, baseUrl, isMember(person)) };
}

/** /post — members only; the poster is the host and is automatically in. */
export async function runPostCommand(discordUserId: string, data: CommandData | undefined): Promise<CommandOutcome> {
	const input = parsePostCommand(data);
	if (typeof input === "string") return { kind: "invalid", message: input };

	const db = getDb();
	const person = await findDiscordPerson(db, discordUserId);
	if (!person) return { kind: "unlinked" };
	if (person.status !== "approved") return { kind: "not_approved" };
	if (!isMember(person)) return { kind: "members_only" };

	// Same as typing a title into the composer: an existing library game is
	// linked by name (case-insensitive), a new one is added as a suggestion.
	const gameId = await resolveOrCreateGame(db, person, input.gameTitle, "a session posted from Discord");
	const [game] = await db.select({ title: schema.games.title }).from(schema.games).where(eq(schema.games.id, gameId));
	// Whole minutes, so "Now" is live immediately and times read cleanly.
	const startsAt = new Date(Math.floor(Date.now() / 60_000) * 60_000 + input.startsInMinutes * 60_000);

	const { id, title } = await insertSession(db, person.id, {
		game: { id: gameId, title: game?.title ?? input.gameTitle },
		startsAt,
		visibility: input.visibility,
		capacity: input.capacity,
		notes: input.notes,
	});
	return { kind: "posted", id, title, startsAt, visibility: input.visibility };
}

/**
 * Library titles matching what's been typed into /post's `game` option.
 * The library is members-only, so anyone else gets no suggestions (they
 * can't post anyway). Never throws: autocomplete has no error state.
 */
export async function suggestGames(discordUserId: string, typed: string): Promise<string[]> {
	try {
		const db = getDb();
		const person = await findDiscordPerson(db, discordUserId);
		if (!person || person.status !== "approved" || !isMember(person)) return [];
		const needle = typed.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
		const rows = await db
			.select({ title: schema.games.title })
			.from(schema.games)
			.where(
				and(
					inArray(schema.games.status, ["playing", "backlog", "proposed", "completed", "abandoned"]),
					needle ? ilike(schema.games.title, `%${needle}%`) : undefined
				)
			)
			.orderBy(
				// What's being played first, then what people want to play.
				sql`case ${schema.games.status} when 'playing' then 0 when 'backlog' then 1 when 'proposed' then 2 else 3 end`,
				asc(schema.games.title)
			)
			.limit(25);
		return rows.map((row) => row.title);
	} catch (error) {
		console.warn("[discord] autocomplete failed:", error);
		return [];
	}
}
