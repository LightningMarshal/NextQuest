// A fake Discord REST API for the E2E suite: just enough of
// /channels/:id/messages for the bot's post / edit / delete, kept in memory
// so tests can assert what Discord would be showing. The app is pointed at
// it with DISCORD_API_BASE (see src/server/discord.ts). Test tooling only.
import http from "node:http";

import { FAKE_DISCORD_PORT } from "./env.mjs";

/** channelId → [{ id, deleted, edits, ...body }] */
const channels = new Map();
/** Deferred interaction replies, by interaction token. */
const followUps = new Map();
/** The bot's registered slash commands (last PUT wins, like Discord). */
let commands = [];
const APPLICATION_ID = "700000000000000001";
const authorized = (req) => req.headers.authorization === "Bot e2e-bot-token";
let nextId = 1000;

function json(res, status, body) {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
}

http
	.createServer(async (req, res) => {
		let raw = "";
		for await (const chunk of req) raw += chunk;
		const url = new URL(req.url, "http://fake");
		if (url.pathname === "/__state") return json(res, 200, Object.fromEntries(channels));
		if (url.pathname === "/__followups") return json(res, 200, Object.fromEntries(followUps));
		if (url.pathname === "/__commands") return json(res, 200, commands);
		if (url.pathname === "/applications/@me") {
			return authorized(req) ? json(res, 200, { id: APPLICATION_ID, name: "NextQuest (fake)" }) : json(res, 401, { message: "401: Unauthorized" });
		}
		if (url.pathname === `/applications/${APPLICATION_ID}/commands` && req.method === "PUT") {
			if (!authorized(req)) return json(res, 401, { message: "401: Unauthorized" });
			commands = JSON.parse(raw).map((command, index) => ({ id: String(600 + index), ...command }));
			return json(res, 200, commands);
		}
		if (url.pathname === "/__reset") {
			channels.clear();
			followUps.clear();
			commands = [];
			return json(res, 200, {});
		}
		// Completing a deferred reply needs no bot token — the interaction
		// token in the URL is the credential.
		const followUp = url.pathname.match(/^\/webhooks\/(\d+)\/([\w.-]+)\/messages\/@original$/);
		if (followUp && req.method === "PATCH") {
			followUps.set(followUp[2], JSON.parse(raw));
			return json(res, 200, { id: "0" });
		}
		const match = url.pathname.match(/^\/channels\/(\d+)\/messages(?:\/(\d+))?$/);
		if (!match) return json(res, 404, { message: "Unknown route" });
		if (!authorized(req)) return json(res, 401, { message: "401: Unauthorized" });
		const [, channelId, messageId] = match;
		const messages = channels.get(channelId) ?? [];
		channels.set(channelId, messages);
		const body = raw ? JSON.parse(raw) : {};

		if (req.method === "POST" && !messageId) {
			const message = { id: String(nextId++), deleted: false, edits: 0, ...body };
			messages.push(message);
			return json(res, 200, { id: message.id });
		}
		const message = messages.find((m) => m.id === messageId && !m.deleted);
		if (!message) return json(res, 404, { message: "Unknown Message" });
		if (req.method === "PATCH") {
			Object.assign(message, body, { edits: message.edits + 1 });
			return json(res, 200, { id: message.id });
		}
		if (req.method === "DELETE") {
			message.deleted = true;
			res.writeHead(204);
			return res.end();
		}
		return json(res, 405, { message: "Method not allowed" });
	})
	.listen(FAKE_DISCORD_PORT, "127.0.0.1", () => console.log(`fake discord on 127.0.0.1:${FAKE_DISCORD_PORT}`));
