import crypto from "node:crypto";
import fs from "node:fs";

import type { APIRequestContext, BrowserContext } from "@playwright/test";
import pg from "pg";

import { APP_URL, AUTH_SECRET, DATABASE_URL, FAKE_DISCORD_URL, STATE_DIR } from "./env.mjs";

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

/**
 * Sign a seeded person in without OAuth: insert a Better Auth session row
 * and set the signed cookie (`token.base64(HMAC-SHA256(token))`, the format
 * better-call's signed cookies use). The app has no test-only seam — this
 * is exactly the cookie a real sign-in would leave.
 */
export async function signInAs(context: BrowserContext, userId: string): Promise<void> {
	const token = `e2e${crypto.randomBytes(16).toString("hex")}`;
	await pool.query(
		"insert into session (id, expires_at, token, user_id) values ($1, now() + interval '1 day', $1, $2)",
		[token, userId]
	);
	const signature = crypto.createHmac("sha256", AUTH_SECRET).update(token).digest("base64");
	await context.clearCookies();
	await context.addCookies([
		{
			name: "better-auth.session_token",
			value: encodeURIComponent(`${token}.${signature}`),
			url: APP_URL,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
}

export type FakeMessage = {
	id: string;
	deleted: boolean;
	edits: number;
	content?: string;
	embeds?: { title: string; fields: { name: string; value: string }[]; footer?: { text: string } }[];
	components?: { components: { label: string; custom_id?: string }[] }[];
};

/** Everything the fake Discord is currently "showing" in a channel. */
export async function discordMessages(channelId: string): Promise<FakeMessage[]> {
	const state = (await (await fetch(`${FAKE_DISCORD_URL}/__state`)).json()) as Record<string, FakeMessage[]>;
	return (state[channelId] ?? []).filter((message) => !message.deleted);
}

/** The session card for a session: the embed whose link is its page. */
export async function sessionCard(channelId: string, sessionId: string): Promise<FakeMessage | undefined> {
	const messages = await discordMessages(channelId);
	return messages.find((message) => JSON.stringify(message.embeds ?? []).includes(`/s/${sessionId}`));
}

/**
 * Deliver an interaction the way Discord does: a signed POST to the
 * interactions endpoint. `tamper` corrupts the signature.
 */
export async function sendInteraction(
	request: APIRequestContext,
	discordUserId: string,
	payload: { type: number; data: unknown },
	options: { tamper?: boolean; token?: string } = {}
) {
	const body = JSON.stringify({
		...payload,
		application_id: "700000000000000001",
		token: options.token ?? `e2e-interaction-token-${crypto.randomBytes(8).toString("hex")}`,
		member: { user: { id: discordUserId } },
	});
	const timestamp = String(Math.floor(Date.now() / 1000));
	const key = crypto.createPrivateKey(fs.readFileSync(`${STATE_DIR}discord-private-key.pem`));
	let signature = crypto.sign(null, Buffer.from(timestamp + body), key).toString("hex");
	if (options.tamper) signature = signature.replace(/^../, signature.startsWith("00") ? "11" : "00");
	return request.post("/api/discord/interactions", {
		headers: { "x-signature-ed25519": signature, "x-signature-timestamp": timestamp, "content-type": "application/json" },
		data: body,
	});
}

/** Press an RSVP button on a session card. */
export function pressButton(
	request: APIRequestContext,
	discordUserId: string,
	customId: string,
	options: { tamper?: boolean; token?: string } = {}
) {
	return sendInteraction(request, discordUserId, { type: 3, data: { custom_id: customId } }, options);
}

/** Run a slash command with the given option values. */
export function runCommand(
	request: APIRequestContext,
	discordUserId: string,
	name: string,
	options: Record<string, string | number | boolean> = {}
) {
	return sendInteraction(request, discordUserId, {
		type: 2,
		data: { name, options: Object.entries(options).map(([key, value]) => ({ name: key, value })) },
	});
}

/** Type into an autocompleting option of a command. */
export function typeInto(request: APIRequestContext, discordUserId: string, name: string, option: string, typed: string) {
	return sendInteraction(request, discordUserId, {
		type: 4,
		data: { name, options: [{ name: option, value: typed, focused: true }] },
	});
}

/** A deferred reply's eventual content, as the fake Discord received it. */
export async function followUpContent(token: string): Promise<string | undefined> {
	const all = (await (await fetch(`${FAKE_DISCORD_URL}/__followups`)).json()) as Record<string, { content: string }>;
	return all[token]?.content;
}
