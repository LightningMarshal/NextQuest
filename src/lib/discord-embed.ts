// Pure builder for the Discord session announcement — ONE message per
// session per webhook, edited in place as the roster, time, or status
// changes (src/server/discord.ts does the posting). Everything a reader
// needs to decide "can I join?" is in the embed; the title links to the
// session page for the one-tap RSVP.

import { formatDuration, safeJoinUrl, type Visibility } from "./sessions";

export type AnnouncedSession = {
	id: string;
	title: string;
	status: "scheduled" | "completed" | "cancelled";
	visibility: Visibility;
	scheduledAt: Date;
	durationMinutes: number | null;
	gameTitle: string | null;
	art: string | null;
	hostName: string | null;
	location: string | null;
	joinUrl: string | null;
	notes: string | null;
	capacity: number | null;
	going: string[];
	maybe: string[];
	came: string[];
	howItWent: number | null;
	recap: string | null;
};

export type DiscordEmbed = {
	title: string;
	url: string;
	description?: string;
	color: number;
	fields: { name: string; value: string; inline?: boolean }[];
	thumbnail?: { url: string };
	footer?: { text: string };
	timestamp?: string;
};

export type DiscordMessage = {
	content?: string;
	embeds: DiscordEmbed[];
	/** Always empty: member-typed text must never ping anyone. */
	allowed_mentions: { parse: [] };
};

const COLORS = {
	open: 0x2ecc71,
	members: 0x22d3ee,
	cancelled: 0x6b7280,
	completed: 0xa78bfa,
};

// Discord hard limits: title 256, description 4096, field value 1024.
function clip(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Neutralize markdown link/format injection in member-typed text. */
export function escapeMarkdown(text: string): string {
	return text.replace(/([\\*_~`|>[\]()])/g, "\\$1");
}

function names(list: string[], empty: string): string {
	return list.length === 0 ? empty : clip(list.map(escapeMarkdown).join(", "), 1024);
}

export function discordTime(date: Date, style: "F" | "R" | "t" | "f" = "F"): string {
	return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export function sessionUrl(baseUrl: string, id: string): string {
	return `${baseUrl.replace(/\/$/, "")}/s/${id}`;
}

export function buildSessionEmbed(session: AnnouncedSession, baseUrl: string): DiscordEmbed {
	const url = sessionUrl(baseUrl, session.id);
	const length = formatDuration(session.durationMinutes);
	const when = `${discordTime(session.scheduledAt)} · ${discordTime(session.scheduledAt, "R")}${length ? ` · ${length}` : ""}`;
	const join = safeJoinUrl(session.joinUrl);
	const where = [session.location ? escapeMarkdown(session.location) : null, join ? `[Join link](${join})` : null]
		.filter(Boolean)
		.join(" · ");
	const art = session.art && session.art.startsWith("https://") ? { url: session.art } : undefined;

	if (session.status === "cancelled") {
		return {
			title: clip(`❌ Cancelled — ${session.title}`, 256),
			url,
			color: COLORS.cancelled,
			fields: [{ name: "Was planned for", value: when }],
			thumbnail: art,
		};
	}

	if (session.status === "completed") {
		const fields: DiscordEmbed["fields"] = [
			{ name: "Played", value: when },
			{ name: `Came (${session.came.length})`, value: names(session.came, "—") },
		];
		if (session.howItWent) fields.push({ name: "How it went", value: `${"★".repeat(session.howItWent)}${"☆".repeat(5 - session.howItWent)}`, inline: true });
		if (session.gameTitle) fields.push({ name: "Game", value: escapeMarkdown(session.gameTitle), inline: true });
		return {
			title: clip(`✅ ${session.title}`, 256),
			url,
			description: session.recap ? clip(escapeMarkdown(session.recap), 600) : undefined,
			color: COLORS.completed,
			fields,
			thumbnail: art,
			footer: { text: "Session wrapped up — details on the session page" },
		};
	}

	const seats =
		session.capacity !== null
			? `${session.going.length}/${session.capacity}${session.going.length >= session.capacity ? " · full" : ""}`
			: String(session.going.length);
	const fields: DiscordEmbed["fields"] = [{ name: "When", value: when }];
	if (session.gameTitle) fields.push({ name: "Game", value: escapeMarkdown(session.gameTitle), inline: true });
	if (session.hostName) fields.push({ name: "Host", value: escapeMarkdown(session.hostName), inline: true });
	if (where) fields.push({ name: "Where", value: clip(where, 1024) });
	fields.push({ name: `In (${seats})`, value: names(session.going, "Nobody yet — be the first") });
	if (session.maybe.length > 0) fields.push({ name: `Maybe (${session.maybe.length})`, value: names(session.maybe, "—") });

	return {
		title: clip(`🎮 ${session.title}`, 256),
		url,
		description: session.notes ? clip(escapeMarkdown(session.notes), 500) : undefined,
		color: session.visibility === "open" ? COLORS.open : COLORS.members,
		fields,
		thumbnail: art,
		footer: {
			text:
				session.visibility === "open"
					? "Open session — anyone in the circle can join. Tap the title to hop in."
					: "Members session — tap the title to RSVP.",
		},
	};
}

export function buildSessionMessage(
	session: AnnouncedSession,
	baseUrl: string,
	content?: string
): DiscordMessage {
	return {
		...(content ? { content: clip(content, 2000) } : {}),
		embeds: [buildSessionEmbed(session, baseUrl)],
		allowed_mentions: { parse: [] },
	};
}
