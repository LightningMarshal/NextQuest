"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { isDiscordWebhookUrl } from "@/lib/webhook-url";
import { requireAdmin } from "@/server/session";

// Admin-managed Discord webhooks (one per server/channel). "all" = the
// group's own server; "open" = a wider server that only hears about open
// sessions. See src/server/discord.ts for delivery.

const webhookSchema = z.object({
	name: z.string().trim().min(1, "Give it a name").max(60),
	url: z.string().trim().refine(isDiscordWebhookUrl, "That isn't a Discord webhook URL (Server Settings → Integrations → Webhooks → Copy URL)."),
	audience: z.enum(["all", "open"]),
});

export async function addWebhook(formData: FormData): Promise<void> {
	const admin = await requireAdmin();
	const parsed = webhookSchema.safeParse({
		name: formData.get("name"),
		url: formData.get("url"),
		audience: formData.get("audience"),
	});
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	await getDb().insert(schema.discordWebhooks).values({ ...parsed.data, createdBy: admin.id });
	revalidatePath("/admin");
}

export async function setWebhookEnabled(id: string, enabled: boolean): Promise<void> {
	await requireAdmin();
	await getDb().update(schema.discordWebhooks).set({ enabled }).where(eq(schema.discordWebhooks.id, id));
	revalidatePath("/admin");
}

export async function deleteWebhook(id: string): Promise<void> {
	await requireAdmin();
	await getDb().delete(schema.discordWebhooks).where(eq(schema.discordWebhooks.id, id));
	revalidatePath("/admin");
}

/** Post a hello so the admin can see it lands in the right channel. */
export async function testWebhook(id: string): Promise<void> {
	await requireAdmin();
	const [hook] = await getDb()
		.select({ url: schema.discordWebhooks.url, audience: schema.discordWebhooks.audience })
		.from(schema.discordWebhooks)
		.where(eq(schema.discordWebhooks.id, id));
	if (!hook) throw new Error("Webhook not found.");
	const res = await fetch(hook.url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			content: `👋 NextQuest is connected here. This channel will get ${hook.audience === "open" ? "open sessions" : "every session and group news"}.`,
			allowed_mentions: { parse: [] },
		}),
		signal: AbortSignal.timeout(5_000),
	}).catch(() => null);
	if (!res?.ok) throw new Error(`Discord didn't accept it${res ? ` (HTTP ${res.status})` : ""} — check the URL.`);
}
