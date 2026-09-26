// Discord delivery (server-only — NOT "use server"). Fire-and-forget by
// design: every send rides waitUntil, never blocks or fails the action that
// triggered it, and no webhook configured means no-op.
//
// Targets: the legacy DISCORD_WEBHOOK_URL secret (audience "all") plus any
// webhooks an admin added on /admin (discord_webhooks). Audience "all"
// hears everything; "open" (a wider server) only hears about sessions
// marked open. Session announcements are ONE message per webhook, edited in
// place (event_discord_messages) as the roster, time, or status changes.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
	buildSessionMessage,
	discordTime,
	escapeMarkdown,
	sessionUrl,
	type AnnouncedSession,
} from "@/lib/discord-embed";

type Audience = "all" | "open";
type Target = { key: string; url: string; audience: Audience };
type Db = ReturnType<typeof getDb>;

const TIMEOUT_MS = 5_000;
/** Placeholder message id while the first post is in flight (claim marker). */
const POSTING = "posting";

function env() {
	return getCloudflareContext().env as { DISCORD_WEBHOOK_URL?: string; BETTER_AUTH_URL?: string };
}

export function appBaseUrl(): string {
	return (env().BETTER_AUTH_URL ?? "").replace(/\/$/, "");
}

/** Run work after the response; swallow and log everything. */
function inBackground(work: () => Promise<void>): void {
	try {
		const { ctx } = getCloudflareContext();
		const promise = work().catch((error) => console.warn("[discord] send failed:", error));
		if (typeof ctx?.waitUntil === "function") ctx.waitUntil(promise);
	} catch {
		// Never let notifications interfere with the actual work.
	}
}

async function loadTargets(db: Db): Promise<Target[]> {
	const targets: Target[] = [];
	const legacy = env().DISCORD_WEBHOOK_URL;
	if (legacy) targets.push({ key: "env", url: legacy, audience: "all" });
	const rows = await db
		.select({ id: schema.discordWebhooks.id, url: schema.discordWebhooks.url, audience: schema.discordWebhooks.audience })
		.from(schema.discordWebhooks)
		.where(eq(schema.discordWebhooks.enabled, true));
	for (const row of rows) targets.push({ key: row.id, url: row.url, audience: row.audience });
	return targets;
}

/** `https://discord.com/api/webhooks/1/abc?thread_id=2` + `/messages/9`, keeping the query. */
function webhookUrl(base: string, suffix = "", params: Record<string, string> = {}): string {
	const url = new URL(base);
	url.pathname = url.pathname.replace(/\/$/, "") + suffix;
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return url.toString();
}

async function send(
	method: "POST" | "PATCH" | "DELETE",
	url: string,
	body?: unknown
): Promise<{ ok: boolean; status: number; id?: string }> {
	const res = await fetch(url, {
		method,
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	let id: string | undefined;
	if (res.ok && method === "POST") {
		const json = (await res.json().catch(() => null)) as { id?: unknown } | null;
		if (typeof json?.id === "string") id = json.id;
	}
	if (!res.ok && res.status !== 404) console.warn(`[discord] ${method} returned ${res.status}`);
	return { ok: res.ok, status: res.status, id };
}

/**
 * A plain group notice (game news, applications) — audience "all" webhooks
 * only; wider-circle servers never see group-internal chatter.
 */
export function notifyDiscord(message: string): void {
	inBackground(async () => {
		const db = getDb();
		const targets = (await loadTargets(db)).filter((target) => target.audience === "all");
		await Promise.all(
			targets.map((target) =>
				send("POST", target.url, { content: message.slice(0, 2000), allowed_mentions: { parse: [] } })
			)
		);
	});
}

/** Discord renders <t:unix:F> in each reader's own timezone. */
export function discordTimestamp(date: Date): string {
	return discordTime(date, "F");
}

async function loadAnnouncedSession(db: Db, eventId: string): Promise<AnnouncedSession | null> {
	const [row] = await db
		.select({
			id: schema.events.id,
			title: schema.events.title,
			status: schema.events.status,
			visibility: schema.events.visibility,
			scheduledAt: schema.events.scheduledAt,
			durationMinutes: schema.events.durationMinutes,
			location: schema.events.location,
			joinUrl: schema.events.joinUrl,
			notes: schema.events.notes,
			capacity: schema.events.capacity,
			howItWent: schema.events.howItWent,
			recap: schema.events.recap,
			createdBy: schema.events.createdBy,
			gameTitle: schema.games.title,
			headerUrl: schema.gameMetadata.headerUrl,
			coverUrl: schema.gameMetadata.coverUrl,
		})
		.from(schema.events)
		.leftJoin(schema.games, eq(schema.events.gameId, schema.games.id))
		.leftJoin(schema.gameMetadata, eq(schema.events.gameId, schema.gameMetadata.gameId))
		.where(eq(schema.events.id, eventId));
	if (!row) return null;

	const people = await db
		.select({
			userId: schema.eventAttendance.userId,
			name: schema.user.name,
			rsvp: schema.eventAttendance.rsvp,
			attended: schema.eventAttendance.attended,
		})
		.from(schema.eventAttendance)
		.innerJoin(schema.user, eq(schema.eventAttendance.userId, schema.user.id))
		.where(eq(schema.eventAttendance.eventId, eventId))
		.orderBy(asc(schema.eventAttendance.respondedAt));
	const host = row.createdBy ? people.find((person) => person.userId === row.createdBy) : undefined;
	let hostName = host?.name ?? null;
	if (!hostName && row.createdBy) {
		const [creator] = await db
			.select({ name: schema.user.name })
			.from(schema.user)
			.where(eq(schema.user.id, row.createdBy));
		hostName = creator?.name ?? null;
	}

	return {
		id: row.id,
		title: row.title,
		status: row.status,
		visibility: row.visibility,
		scheduledAt: row.scheduledAt,
		durationMinutes: row.durationMinutes,
		gameTitle: row.gameTitle,
		art: row.headerUrl ?? row.coverUrl,
		hostName,
		location: row.location,
		joinUrl: row.joinUrl,
		notes: row.notes,
		capacity: row.capacity,
		going: people.filter((p) => p.rsvp === "yes").map((p) => p.name),
		maybe: people.filter((p) => p.rsvp === "maybe").map((p) => p.name),
		came: people.filter((p) => p.attended === true).map((p) => p.name),
		howItWent: row.howItWent,
		recap: row.recap,
	};
}

function eligible(target: Target, visibility: "members" | "open"): boolean {
	return target.audience === "all" || visibility === "open";
}

/**
 * Bring every webhook's announcement for this session up to date: post it
 * where it's missing (scheduled sessions only), edit it where it exists, and
 * delete it from open-audience servers if the session stopped being open.
 * `notice` additionally posts a short new line (time change, cancellation,
 * reminder) so people who muted edits still hear about it.
 */
export function syncSessionAnnouncement(eventId: string, notice?: (link: string) => string): void {
	inBackground(async () => {
		const db = getDb();
		const [session, targets] = await Promise.all([loadAnnouncedSession(db, eventId), loadTargets(db)]);
		if (!session || targets.length === 0) return;
		const baseUrl = appBaseUrl();
		const message = buildSessionMessage(session, baseUrl);
		const existing = await db
			.select({ webhookKey: schema.eventDiscordMessages.webhookKey, messageId: schema.eventDiscordMessages.messageId })
			.from(schema.eventDiscordMessages)
			.where(eq(schema.eventDiscordMessages.eventId, eventId));
		const byKey = new Map(existing.map((row) => [row.webhookKey, row.messageId]));

		await Promise.all(
			targets.map(async (target) => {
				const messageId = byKey.get(target.key);
				const ok = eligible(target, session.visibility);

				if (!ok) {
					if (messageId && messageId !== POSTING) {
						await send("DELETE", webhookUrl(target.url, `/messages/${messageId}`));
						await db
							.delete(schema.eventDiscordMessages)
							.where(and(eq(schema.eventDiscordMessages.eventId, eventId), eq(schema.eventDiscordMessages.webhookKey, target.key)));
					}
					return;
				}

				if (messageId && messageId !== POSTING) {
					const patched = await send("PATCH", webhookUrl(target.url, `/messages/${messageId}`), message);
					if (patched.ok || patched.status !== 404) return;
					// Someone deleted it in Discord — fall through and repost.
					await db
						.delete(schema.eventDiscordMessages)
						.where(and(eq(schema.eventDiscordMessages.eventId, eventId), eq(schema.eventDiscordMessages.webhookKey, target.key)));
				}
				if (messageId === POSTING) return; // another request is posting it
				if (session.status !== "scheduled") return; // never announce a closed session fresh

				// Claim the slot first so two quick RSVPs can't double-post.
				const claimed = await db
					.insert(schema.eventDiscordMessages)
					.values({ eventId, webhookKey: target.key, messageId: POSTING })
					.onConflictDoNothing()
					.returning({ eventId: schema.eventDiscordMessages.eventId });
				if (claimed.length === 0) return;
				const posted = await send("POST", webhookUrl(target.url, "", { wait: "true" }), message);
				const where = and(
					eq(schema.eventDiscordMessages.eventId, eventId),
					eq(schema.eventDiscordMessages.webhookKey, target.key)
				);
				if (posted.id) {
					await db.update(schema.eventDiscordMessages).set({ messageId: posted.id, updatedAt: new Date() }).where(where);
				} else {
					await db.delete(schema.eventDiscordMessages).where(where);
				}
			})
		);

		if (notice) {
			const content = notice(sessionUrl(baseUrl, session.id)).slice(0, 2000);
			await Promise.all(
				targets
					.filter((target) => eligible(target, session.visibility))
					.map((target) => send("POST", target.url, { content, allowed_mentions: { parse: [] } }))
			);
		}
	});
}

/** Bulk variant for the cron: reminders for several sessions in one tick. */
export function postSessionReminders(
	reminders: { eventId: string; visibility: "members" | "open"; text: (link: string) => string }[]
): void {
	if (reminders.length === 0) return;
	inBackground(async () => {
		const db = getDb();
		const targets = await loadTargets(db);
		const baseUrl = appBaseUrl();
		await Promise.all(
			reminders.flatMap((reminder) =>
				targets
					.filter((target) => eligible(target, reminder.visibility))
					.map((target) =>
						send("POST", target.url, {
							content: reminder.text(sessionUrl(baseUrl, reminder.eventId)).slice(0, 2000),
							allowed_mentions: { parse: [] },
						})
					)
			)
		);
	});
}

/** Safe for message text: a session/game title with markdown neutralized. */
export function md(text: string): string {
	return escapeMarkdown(text);
}
