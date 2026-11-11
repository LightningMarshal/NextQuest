// Pure half of the Discord bot's slash commands (/sessions, /post): the
// command definitions Discord is told about, option parsing, and the text
// of every reply. The DB half is src/server/discord-commands.ts; requests
// arrive through api/discord/interactions.
//
// Why "starts" is a short list of offsets rather than a time: Discord has
// no date/time option and doesn't tell a bot the user's timezone, and the
// server runs in UTC — "8pm" typed into Discord would be a guess. "In an
// hour" means the same thing everywhere; anything more specific belongs in
// the composer, which every reply links to.

import { discordTime, escapeMarkdown } from "./discord-embed";

export const START_CHOICES = [
	{ name: "Now", value: 0 },
	{ name: "In 30 minutes", value: 30 },
	{ name: "In 1 hour", value: 60 },
	{ name: "In 2 hours", value: 120 },
	{ name: "In 3 hours", value: 180 },
] as const;

const OPTION = { STRING: 3, INTEGER: 4, BOOLEAN: 5 } as const;

/** Exactly what gets PUT to Discord's /applications/{id}/commands. */
export const COMMANDS = [
	{ name: "sessions", type: 1, description: "See what's coming up — only you see the answer" },
	{
		name: "post",
		type: 1,
		description: "Post a session starting soon",
		options: [
			{ type: OPTION.STRING, name: "game", description: "What are you playing?", required: true, autocomplete: true, max_length: 200 },
			{ type: OPTION.INTEGER, name: "starts", description: "When does it start?", required: true, choices: START_CHOICES },
			{ type: OPTION.BOOLEAN, name: "open", description: "Open to the wider circle (guests)? Default: members only" },
			{ type: OPTION.INTEGER, name: "seats", description: "Seat limit, if there is one", min_value: 2, max_value: 100 },
			{ type: OPTION.STRING, name: "note", description: "A line of detail — where, what to bring", max_length: 500 },
		],
	},
] as const;

export type CommandOption = { name?: unknown; value?: unknown; focused?: unknown };
export type CommandData = { name?: unknown; options?: unknown };

function options(data: CommandData | undefined): CommandOption[] {
	return Array.isArray(data?.options) ? (data.options as CommandOption[]) : [];
}

function option(data: CommandData | undefined, name: string): unknown {
	return options(data).find((entry) => entry?.name === name)?.value;
}

export type PostInput = {
	gameTitle: string;
	startsInMinutes: number;
	visibility: "members" | "open";
	capacity: number | undefined;
	notes: string | undefined;
};

/**
 * /post's options, re-validated: Discord enforces the declared limits in
 * its own client, but this endpoint trusts nothing it can check itself.
 * Returns a sentence instead when something is off.
 */
export function parsePostCommand(data: CommandData | undefined): PostInput | string {
	const game = option(data, "game");
	const gameTitle = typeof game === "string" ? game.trim() : "";
	if (!gameTitle) return "Tell me what you're playing — the `game` option.";
	if (gameTitle.length > 200) return "That game title is too long.";

	const starts = option(data, "starts");
	if (!START_CHOICES.some((choice) => choice.value === starts)) return "Pick one of the start times from the list.";

	const seats = option(data, "seats");
	if (seats !== undefined && !(typeof seats === "number" && Number.isInteger(seats) && seats >= 2 && seats <= 100)) {
		return "Seats must be a whole number from 2 to 100.";
	}
	const note = option(data, "note");
	if (note !== undefined && (typeof note !== "string" || note.length > 500)) return "That note is too long.";

	return {
		gameTitle,
		startsInMinutes: starts as number,
		visibility: option(data, "open") === true ? "open" : "members",
		capacity: seats as number | undefined,
		notes: typeof note === "string" && note.trim() ? note.trim() : undefined,
	};
}

/** What the user has typed so far in an autocompleting option, if any. */
export function focusedText(data: CommandData | undefined): string | null {
	const focused = options(data).find((entry) => entry?.focused === true);
	return focused && typeof focused.value === "string" ? focused.value.slice(0, 100) : null;
}

/** Autocomplete answer (interaction response type 8). At most 25, names ≤ 100. */
export function autocompleteReply(titles: string[]) {
	return {
		type: 8,
		data: { choices: titles.slice(0, 25).map((title) => ({ name: title.slice(0, 100), value: title.slice(0, 100) })) },
	} as const;
}

export type ListedSession = {
	id: string;
	title: string;
	scheduledAt: Date;
	visibility: "members" | "open";
	capacity: number | null;
	going: number;
};

// <angle brackets> stop Discord unfurling a preview card for every link.
const link = (url: string) => `<${url}>`;

/** /sessions: one line per session, already filtered for this viewer. */
export function sessionsListText(sessions: ListedSession[], baseUrl: string, viewerIsMember: boolean): string {
	if (sessions.length === 0) {
		return viewerIsMember
			? "Nothing's scheduled. Start something with `/post`."
			: "No open sessions right now — check back soon.";
	}
	const lines = sessions.map((session) => {
		const seats = session.capacity !== null ? `${session.going}/${session.capacity}` : String(session.going);
		const tag = session.visibility === "open" ? "open" : "members";
		return `• **${escapeMarkdown(session.title)}** — ${discordTime(session.scheduledAt, "f")} (${discordTime(session.scheduledAt, "R")}) · ${seats} in · ${tag}\n  ${link(`${baseUrl}/s/${session.id}`)}`;
	});
	// Discord caps a message at 2000 characters; drop whole lines, never half of one.
	const header = "**Coming up**";
	const kept: string[] = [];
	let length = header.length;
	for (const line of lines) {
		if (length + line.length + 1 > 1900) break;
		kept.push(line);
		length += line.length + 1;
	}
	const more = sessions.length - kept.length;
	return [header, ...kept, ...(more > 0 ? [`…and ${more} more: ${link(`${baseUrl}/sessions`)}`] : [])].join("\n");
}

export type CommandOutcome =
	| { kind: "unlinked" }
	| { kind: "not_approved" }
	| { kind: "members_only" }
	| { kind: "invalid"; message: string }
	| { kind: "posted"; id: string; title: string; startsAt: Date; visibility: "members" | "open" }
	| { kind: "text"; text: string };

export function commandReplyText(outcome: CommandOutcome, baseUrl: string): string {
	switch (outcome.kind) {
		case "unlinked":
			return `I don't know who you are on NextQuest yet. Connect your Discord once and commands work from then on: ${link(`${baseUrl}/connect-discord`)}`;
		case "not_approved":
			return `Your NextQuest account isn't approved yet: ${link(`${baseUrl}/apply`)}`;
		case "members_only":
			return "Posting sessions is for group members. You can join any open session with `/sessions`.";
		case "invalid":
			return outcome.message;
		case "posted":
			return [
				`🎮 Posted **${escapeMarkdown(outcome.title)}** for ${discordTime(outcome.startsAt, "t")} (${discordTime(outcome.startsAt, "R")}) — ${outcome.visibility === "open" ? "open to the circle" : "members only"}. You're in.`,
				`Add a join link, change the time or anything else: ${link(`${baseUrl}/s/${outcome.id}/edit`)}`,
			].join("\n");
		case "text":
			return outcome.text;
	}
}
