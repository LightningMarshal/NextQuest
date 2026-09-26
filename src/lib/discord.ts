import { getCloudflareContext } from "@opennextjs/cloudflare";

// Optional Discord webhook notifications. Fire-and-forget by design: no
// DISCORD_WEBHOOK_URL configured means no-op, and a failed send must never
// block or fail the action that triggered it. Delivery rides waitUntil so
// the response isn't held up.

export function notifyDiscord(message: string): void {
	try {
		const { env, ctx } = getCloudflareContext();
		const url = (env as { DISCORD_WEBHOOK_URL?: string }).DISCORD_WEBHOOK_URL;
		if (!url) return;

		const send = fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			// Titles and names are member-typed: never let them ping @everyone,
			// @here, roles, or users.
			body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }),
			signal: AbortSignal.timeout(5_000),
		})
			.then((res) => {
				if (!res.ok) console.warn(`Discord webhook returned ${res.status}`);
			})
			.catch((error) => console.warn("Discord webhook failed:", error));

		if (typeof ctx?.waitUntil === "function") {
			ctx.waitUntil(send);
		} else {
			void send;
		}
	} catch {
		// Never let notifications interfere with the actual work.
	}
}

/** Discord renders <t:unix:F> in each reader's own timezone. */
export function discordTimestamp(date: Date): string {
	return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}
