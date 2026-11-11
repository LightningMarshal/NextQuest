"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { COMMANDS } from "@/lib/discord-commands";
import { parseChannelId } from "@/lib/discord-interactions";
import { discordApiBase } from "@/server/discord";
import { requireAdmin } from "@/server/session";

// Admin-managed channels for the Discord bot (one per server/channel), the
// button-carrying sibling of webhooks.ts. Audiences mean the same thing:
// "all" = the group's own server; "open" = a wider server that only hears
// about open sessions. See src/server/discord.ts for delivery.

const channelSchema = z.object({
	name: z.string().trim().min(1, "Give it a name").max(60),
	audience: z.enum(["all", "open"]),
});

function botToken(): string {
	const token = (getCloudflareContext().env as { DISCORD_BOT_TOKEN?: string }).DISCORD_BOT_TOKEN;
	if (!token) throw new Error("The bot isn't configured yet — set DISCORD_BOT_TOKEN and DISCORD_PUBLIC_KEY first.");
	return token;
}

/** POST as the bot; throws a readable line when Discord refuses. */
async function botPost(channelId: string, content: string): Promise<void> {
	const res = await fetch(`${discordApiBase()}/channels/${channelId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bot ${botToken()}` },
		body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
		signal: AbortSignal.timeout(5_000),
	}).catch(() => null);
	if (res?.ok) return;
	const why =
		res?.status === 401
			? "Discord rejected the bot token"
			: res?.status === 403
				? "the bot can't post there — invite it to the server and give it View Channel, Send Messages and Embed Links"
				: res?.status === 404
					? "Discord doesn't know that channel (is the bot in that server?)"
					: `Discord didn't accept it${res ? ` (HTTP ${res.status})` : ""}`;
	throw new Error(`Couldn't post: ${why}.`);
}

/**
 * Add a channel. Posts a hello FIRST and only saves on success, so a
 * channel the bot can't reach never sits in the list silently dropping
 * every session card.
 */
export async function addBotChannel(formData: FormData): Promise<void> {
	const admin = await requireAdmin();
	const parsed = channelSchema.safeParse({ name: formData.get("name"), audience: formData.get("audience") });
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	const channelId = parseChannelId(String(formData.get("channel") ?? ""));
	if (!channelId) throw new Error("Paste the channel ID (right-click the channel → Copy Channel ID) or a link to the channel.");

	const db = getDb();
	const [existing] = await db
		.select({ name: schema.discordBotChannels.name })
		.from(schema.discordBotChannels)
		.where(eq(schema.discordBotChannels.channelId, channelId));
	if (existing) throw new Error(`That channel is already added as “${existing.name}”.`);

	await botPost(
		channelId,
		`👋 NextQuest's bot is connected here. This channel will get ${parsed.data.audience === "open" ? "open sessions" : "every session and group news"}, with buttons to join.`
	);
	await db.insert(schema.discordBotChannels).values({ ...parsed.data, channelId, createdBy: admin.id }).onConflictDoNothing();
	revalidatePath("/admin");
}

export async function setBotChannelEnabled(id: string, enabled: boolean): Promise<void> {
	await requireAdmin();
	await getDb().update(schema.discordBotChannels).set({ enabled }).where(eq(schema.discordBotChannels.id, id));
	revalidatePath("/admin");
}

export async function deleteBotChannel(id: string): Promise<void> {
	await requireAdmin();
	await getDb().delete(schema.discordBotChannels).where(eq(schema.discordBotChannels.id, id));
	revalidatePath("/admin");
}

export async function testBotChannel(id: string): Promise<void> {
	await requireAdmin();
	const [channel] = await getDb()
		.select({ channelId: schema.discordBotChannels.channelId })
		.from(schema.discordBotChannels)
		.where(eq(schema.discordBotChannels.id, id));
	if (!channel) throw new Error("Channel not found.");
	await botPost(channel.channelId, "👋 Test from NextQuest — the bot can post here.");
}

/**
 * Tell Discord about /sessions and /post (a full replace of the bot's
 * global commands, so it's safe to press again after an update). Returns
 * the names Discord now has, for the admin to see. Discord can take a few
 * minutes to show new commands in its clients.
 */
export async function registerBotCommands(): Promise<{ commands: string[] }> {
	await requireAdmin();
	const headers = { "Content-Type": "application/json", Authorization: `Bot ${botToken()}` };
	const base = discordApiBase();

	// The application id isn't a setting of ours: ask Discord whose token this is.
	const me = await fetch(`${base}/applications/@me`, { headers, signal: AbortSignal.timeout(5_000) }).catch(() => null);
	if (!me?.ok) {
		throw new Error(me?.status === 401 ? "Discord rejected the bot token." : `Couldn't reach Discord${me ? ` (HTTP ${me.status})` : ""} — try again.`);
	}
	const application = (await me.json().catch(() => null)) as { id?: unknown } | null;
	if (typeof application?.id !== "string" || !/^\d{5,25}$/.test(application.id)) throw new Error("Discord didn't say which application this bot belongs to.");

	const res = await fetch(`${base}/applications/${application.id}/commands`, {
		method: "PUT",
		headers,
		body: JSON.stringify(COMMANDS),
		signal: AbortSignal.timeout(5_000),
	}).catch(() => null);
	if (!res?.ok) throw new Error(`Discord didn't accept the commands${res ? ` (HTTP ${res.status})` : ""}.`);
	const registered = (await res.json().catch(() => [])) as { name?: unknown }[];
	return { commands: Array.isArray(registered) ? registered.map((command) => String(command.name)) : [] };
}
