// Pure helpers for the Discord bot's interactions endpoint
// (src/app/api/discord/interactions/route.ts): request signature
// verification, the RSVP buttons that ride on a session card, and the
// replies. No DB, no env — everything here is unit-tested.

import type { Rsvp, SessionStatus } from "./sessions";

// --- Signature ---------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
	if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

/** Reject requests whose signed timestamp is this far from now (replays). */
export const MAX_SKEW_SECONDS = 5 * 60;

/**
 * Discord signs every interaction: Ed25519 over `timestamp + rawBody` with
 * the application's public key. Anything that fails — bad hex, wrong key,
 * stale timestamp — is simply "not Discord". Runs on WebCrypto (Workers and
 * Node 22 both ship Ed25519).
 */
export async function verifyDiscordRequest(input: {
	publicKeyHex: string;
	signatureHex: string | null;
	timestamp: string | null;
	rawBody: string;
	now?: Date;
}): Promise<boolean> {
	const { publicKeyHex, signatureHex, timestamp, rawBody } = input;
	if (!signatureHex || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
	const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
	if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
	const key = hexToBytes(publicKeyHex.trim());
	const signature = hexToBytes(signatureHex);
	if (!key || key.length !== 32 || !signature || signature.length !== 64) return false;
	try {
		const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "Ed25519" }, false, ["verify"]);
		return await crypto.subtle.verify(
			{ name: "Ed25519" },
			cryptoKey,
			signature,
			new TextEncoder().encode(timestamp + rawBody)
		);
	} catch {
		return false;
	}
}

// --- Buttons -----------------------------------------------------------------

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CUSTOM_ID_RE = new RegExp(`^nq:rsvp:(${UUID}):(yes|maybe|no)$`, "i");

export function rsvpCustomId(sessionId: string, rsvp: Rsvp): string {
	return `nq:rsvp:${sessionId}:${rsvp}`;
}

/** custom_id comes back from Discord verbatim, but treat it as untrusted. */
export function parseRsvpCustomId(value: unknown): { sessionId: string; rsvp: Rsvp } | null {
	if (typeof value !== "string") return null;
	const match = value.match(CUSTOM_ID_RE);
	return match ? { sessionId: match[1].toLowerCase(), rsvp: match[2].toLowerCase() as Rsvp } : null;
}

export type DiscordButton =
	| { type: 2; style: 1 | 2 | 3 | 4; label: string; custom_id: string; disabled?: boolean }
	| { type: 2; style: 5; label: string; url: string };
export type DiscordActionRow = { type: 1; components: DiscordButton[] };

/**
 * The button row under a session card. Open for RSVPs only while the
 * session is scheduled; a closed session gets an EMPTY list, which strips
 * the buttons off the edited message. A full session keeps "I'm in"
 * clickable — someone already in must be able to stay in, and the server
 * says "full" to everyone else.
 */
export function sessionComponents(session: { id: string; status: SessionStatus }, url: string): DiscordActionRow[] {
	if (session.status !== "scheduled") return [];
	return [
		{
			type: 1,
			components: [
				{ type: 2, style: 3, label: "I'm in", custom_id: rsvpCustomId(session.id, "yes") },
				{ type: 2, style: 2, label: "Maybe", custom_id: rsvpCustomId(session.id, "maybe") },
				{ type: 2, style: 2, label: "Out", custom_id: rsvpCustomId(session.id, "no") },
				...(/^https?:\/\//.test(url) ? [{ type: 2 as const, style: 5 as const, label: "Open", url }] : []),
			],
		},
	];
}

// --- Interactions ------------------------------------------------------------

export const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3 } as const;

export type DiscordInteraction = {
	type?: number;
	/** The bot's application id and this interaction's follow-up token. */
	application_id?: unknown;
	token?: unknown;
	data?: { custom_id?: unknown };
	/** Present in servers. */
	member?: { user?: { id?: unknown } };
	/** Present in DMs. */
	user?: { id?: unknown };
};

/** Who pressed it — a Discord user id (snowflake), or null if malformed. */
export function interactionUserId(interaction: DiscordInteraction): string | null {
	const id = interaction.member?.user?.id ?? interaction.user?.id;
	return typeof id === "string" && /^\d{5,25}$/.test(id) ? id : null;
}

export type InteractionReply = {
	type: 4;
	data: { content: string; flags: 64; allowed_mentions: { parse: [] } };
};

/** A reply only the presser sees — the card itself is edited separately. */
export function ephemeralReply(content: string): InteractionReply {
	return { type: 4, data: { content: content.slice(0, 2000), flags: 64, allowed_mentions: { parse: [] } } };
}

export const PONG = { type: 1 } as const;

/**
 * Discord allows 3 seconds to answer a button press. Past this budget the
 * endpoint answers "thinking…" instead (DEFERRED) and delivers the real
 * line as a follow-up — a Neon database waking from idle can take longer
 * than Discord will wait, and "This interaction failed" on the first press
 * of the evening is exactly when it would happen.
 */
export const REPLY_BUDGET_MS = 2_000;

/** "Thinking…", visible only to the presser; completed by a follow-up. */
export const DEFERRED_EPHEMERAL = { type: 5, data: { flags: 64 } } as const;

/**
 * Where a deferred reply is completed: PATCH the original response. Built
 * only from a numeric application id and a token of URL-safe characters —
 * both arrive in the (signed) interaction, but nothing unvalidated is ever
 * interpolated into a URL. Returns null if either looks wrong.
 */
export function followUpPath(interaction: DiscordInteraction): string | null {
	const { application_id: applicationId, token } = interaction;
	if (typeof applicationId !== "string" || !/^\d{5,25}$/.test(applicationId)) return null;
	if (typeof token !== "string" || !/^[\w.-]{20,400}$/.test(token)) return null;
	return `/webhooks/${applicationId}/${token}/messages/@original`;
}

/** Every outcome of pressing an RSVP button, as the line the presser reads. */
export type RsvpOutcome =
	| { kind: "saved"; rsvp: Rsvp; title: string }
	| { kind: "unlinked" }
	| { kind: "not_approved" }
	| { kind: "not_found" }
	| { kind: "closed" }
	| { kind: "full" };

export function rsvpReplyText(outcome: RsvpOutcome, links: { session: string; connect: string; apply: string }): string {
	switch (outcome.kind) {
		case "saved":
			if (outcome.rsvp === "yes") return `✅ You're in for **${outcome.title}**. Details: ${links.session}`;
			if (outcome.rsvp === "maybe") return `🤔 Marked as maybe for **${outcome.title}**.`;
			return `👋 You're out of **${outcome.title}** — thanks for saying so.`;
		case "unlinked":
			return `I don't know who you are on NextQuest yet. Connect your Discord once and these buttons work from then on: ${links.connect}`;
		case "not_approved":
			return `Your NextQuest account isn't approved yet: ${links.apply}`;
		case "not_found":
			return "That session isn't available to you — it may be members-only, or gone.";
		case "closed":
			return "This session is over — RSVPs are closed.";
		case "full":
			return "It's full — try Maybe and the host will see you.";
	}
}

/** A Discord channel/thread id as an admin would paste it (or a channel URL). */
export function parseChannelId(input: string): string | null {
	const trimmed = input.trim();
	const fromUrl = trimmed.match(/discord(?:app)?\.com\/channels\/\d{5,25}\/(\d{5,25})(?:\/\d+)?\/?$/);
	const id = fromUrl ? fromUrl[1] : trimmed;
	return /^\d{15,25}$/.test(id) ? id : null;
}
