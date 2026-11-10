import { describe, expect, it } from "vitest";

import {
	ephemeralReply,
	interactionUserId,
	parseChannelId,
	parseRsvpCustomId,
	rsvpCustomId,
	rsvpReplyText,
	sessionComponents,
	verifyDiscordRequest,
} from "./discord-interactions";

const ID = "5eed0002-0000-4000-8000-000000000001";

async function signer() {
	const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
	const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
	const publicKeyHex = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
	const sign = async (timestamp: string, body: string) =>
		hex(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(timestamp + body)));
	return { publicKeyHex, sign };
}

describe("verifyDiscordRequest", () => {
	const now = new Date("2026-11-10T12:00:00Z");
	const timestamp = String(Math.floor(now.getTime() / 1000));
	const rawBody = '{"type":1}';

	it("accepts a correctly signed request", async () => {
		const { publicKeyHex, sign } = await signer();
		const signatureHex = await sign(timestamp, rawBody);
		expect(await verifyDiscordRequest({ publicKeyHex, signatureHex, timestamp, rawBody, now })).toBe(true);
	});

	it("rejects a tampered body, a wrong key, and a stale timestamp", async () => {
		const { publicKeyHex, sign } = await signer();
		const other = await signer();
		const signatureHex = await sign(timestamp, rawBody);
		expect(await verifyDiscordRequest({ publicKeyHex, signatureHex, timestamp, rawBody: '{"type":3}', now })).toBe(false);
		expect(await verifyDiscordRequest({ publicKeyHex: other.publicKeyHex, signatureHex, timestamp, rawBody, now })).toBe(false);
		const later = new Date(now.getTime() + 6 * 60_000);
		expect(await verifyDiscordRequest({ publicKeyHex, signatureHex, timestamp, rawBody, now: later })).toBe(false);
	});

	it("rejects missing or malformed headers without throwing", async () => {
		const { publicKeyHex } = await signer();
		expect(await verifyDiscordRequest({ publicKeyHex, signatureHex: null, timestamp, rawBody, now })).toBe(false);
		expect(await verifyDiscordRequest({ publicKeyHex, signatureHex: "zz", timestamp, rawBody, now })).toBe(false);
		expect(await verifyDiscordRequest({ publicKeyHex, signatureHex: "ab".repeat(64), timestamp: "soon", rawBody, now })).toBe(false);
		expect(await verifyDiscordRequest({ publicKeyHex: "nope", signatureHex: "ab".repeat(64), timestamp, rawBody, now })).toBe(false);
		expect(await verifyDiscordRequest({ publicKeyHex, signatureHex: "ab".repeat(64), timestamp, rawBody, now })).toBe(false);
	});
});

describe("RSVP buttons", () => {
	it("round-trips a custom id and rejects anything else", () => {
		expect(parseRsvpCustomId(rsvpCustomId(ID, "maybe"))).toEqual({ sessionId: ID, rsvp: "maybe" });
		expect(parseRsvpCustomId(`nq:rsvp:${ID}:yes; drop table`)).toBeNull();
		expect(parseRsvpCustomId("nq:rsvp:not-a-uuid:yes")).toBeNull();
		expect(parseRsvpCustomId(`nq:rsvp:${ID}:attending`)).toBeNull();
		expect(parseRsvpCustomId(42)).toBeNull();
	});

	it("puts three RSVP buttons and a link on a scheduled session", () => {
		const [row] = sessionComponents({ id: ID, status: "scheduled" }, `https://nq.example/s/${ID}`);
		expect(row.components.map((button) => button.label)).toEqual(["I'm in", "Maybe", "Out", "Open"]);
		expect(row.components[0]).toMatchObject({ custom_id: `nq:rsvp:${ID}:yes`, style: 3 });
		expect(row.components[3]).toMatchObject({ style: 5, url: `https://nq.example/s/${ID}` });
	});

	it("strips the buttons once a session is closed", () => {
		expect(sessionComponents({ id: ID, status: "completed" }, "https://nq.example/s/x")).toEqual([]);
		expect(sessionComponents({ id: ID, status: "cancelled" }, "https://nq.example/s/x")).toEqual([]);
	});

	it("omits the link button when there is no absolute base URL", () => {
		const [row] = sessionComponents({ id: ID, status: "scheduled" }, `/s/${ID}`);
		expect(row.components).toHaveLength(3);
	});
});

describe("interaction helpers", () => {
	it("finds the presser in a server and in a DM", () => {
		expect(interactionUserId({ member: { user: { id: "123456789012345678" } } })).toBe("123456789012345678");
		expect(interactionUserId({ user: { id: "123456789012345678" } })).toBe("123456789012345678");
		expect(interactionUserId({ user: { id: "1 or 1=1" } })).toBeNull();
		expect(interactionUserId({})).toBeNull();
	});

	it("replies ephemerally and can never ping", () => {
		const reply = ephemeralReply("hi @everyone");
		expect(reply).toEqual({ type: 4, data: { content: "hi @everyone", flags: 64, allowed_mentions: { parse: [] } } });
	});

	it("words every outcome", () => {
		const links = { session: "S", connect: "C", apply: "A" };
		expect(rsvpReplyText({ kind: "saved", rsvp: "yes", title: "Rust" }, links)).toContain("You're in for **Rust**");
		expect(rsvpReplyText({ kind: "unlinked" }, links)).toContain("C");
		expect(rsvpReplyText({ kind: "not_approved" }, links)).toContain("A");
		expect(rsvpReplyText({ kind: "full" }, links)).toContain("full");
		expect(rsvpReplyText({ kind: "closed" }, links)).toContain("closed");
		expect(rsvpReplyText({ kind: "not_found" }, links)).not.toContain("S");
	});

	it("reads a channel id or a channel link", () => {
		expect(parseChannelId(" 1234567890123456789 ")).toBe("1234567890123456789");
		expect(parseChannelId("https://discord.com/channels/111111111111111111/222222222222222222")).toBe("222222222222222222");
		expect(parseChannelId("https://evil.example/channels/1/2")).toBeNull();
		expect(parseChannelId("general")).toBeNull();
	});
});
