import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
	ephemeralReply,
	interactionUserId,
	InteractionType,
	parseRsvpCustomId,
	PONG,
	rsvpReplyText,
	verifyDiscordRequest,
	type DiscordInteraction,
	type RsvpOutcome,
} from "@/lib/discord-interactions";
import { escapeMarkdown, sessionUrl } from "@/lib/discord-embed";
import { appBaseUrl, syncSessionAnnouncement } from "@/server/discord";
import { applyRsvp } from "@/server/session-rsvp";

// The Discord bot's interactions endpoint: Discord POSTs here when someone
// presses "I'm in" / "Maybe" / "Out" on a session card the bot posted.
// Set it as the application's "Interactions Endpoint URL"
// (docs/deployment/13-discord-bot.md).
//
// This route lives outside every auth gate — there is no browser session.
// Identity comes from two things instead, in this order:
//   1. the Ed25519 signature proves the request is from Discord, so the
//      Discord user id in it is real — this check MUST stay first;
//   2. that Discord id maps to a NextQuest account through Better Auth's
//      `account` table (they signed in with, or connected, Discord).
// From there the normal rules apply via applyRsvp: guests only touch open
// sessions, no RSVPs to a finished night, the seat cap is atomic.

export const dynamic = "force-dynamic";

function unauthorized(): Response {
	// Discord probes the endpoint with bad signatures and requires a 401.
	return new Response("invalid request signature", { status: 401 });
}

async function resolveRsvp(discordUserId: string, sessionId: string, rsvp: "yes" | "maybe" | "no"): Promise<RsvpOutcome> {
	const db = getDb();
	const [person] = await db
		.select({ id: schema.user.id, role: schema.user.role, status: schema.user.status })
		.from(schema.account)
		.innerJoin(schema.user, eq(schema.account.userId, schema.user.id))
		.where(and(eq(schema.account.providerId, "discord"), eq(schema.account.accountId, discordUserId)));
	if (!person) return { kind: "unlinked" };
	if (person.status !== "approved") return { kind: "not_approved" };

	const result = await applyRsvp(db, person, sessionId, rsvp);
	if (!result.ok) return { kind: result.reason };

	// Edits every card for this session (this one included) and refreshes
	// the pages — exactly what the web action does.
	syncSessionAnnouncement(sessionId);
	revalidatePath("/");
	revalidatePath("/sessions");
	revalidatePath(`/s/${sessionId}`);
	return { kind: "saved", rsvp, title: escapeMarkdown(result.title) };
}

export async function POST(request: Request): Promise<Response> {
	const { env } = getCloudflareContext();
	const publicKeyHex = (env as { DISCORD_PUBLIC_KEY?: string }).DISCORD_PUBLIC_KEY;
	if (!publicKeyHex) return unauthorized(); // bot not configured → nothing to answer

	const rawBody = await request.text();
	const verified = await verifyDiscordRequest({
		publicKeyHex,
		signatureHex: request.headers.get("x-signature-ed25519"),
		timestamp: request.headers.get("x-signature-timestamp"),
		rawBody,
	});
	if (!verified) return unauthorized();

	let interaction: DiscordInteraction;
	try {
		interaction = JSON.parse(rawBody) as DiscordInteraction;
	} catch {
		return new Response("bad request", { status: 400 });
	}

	if (interaction.type === InteractionType.PING) return Response.json(PONG);

	if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
		const button = parseRsvpCustomId(interaction.data?.custom_id);
		const discordUserId = interactionUserId(interaction);
		if (!button || !discordUserId) {
			return Response.json(ephemeralReply("That button isn't something I understand anymore."));
		}
		const baseUrl = appBaseUrl();
		let outcome: RsvpOutcome;
		try {
			outcome = await resolveRsvp(discordUserId, button.sessionId, button.rsvp);
		} catch (error) {
			// Discord shows "This interaction failed" on a non-2xx; a sentence is kinder.
			console.warn("[discord] interaction failed:", error);
			return Response.json(ephemeralReply(`Something went wrong saving that — try on the session page: ${sessionUrl(baseUrl, button.sessionId)}`));
		}
		return Response.json(
			ephemeralReply(
				rsvpReplyText(outcome, {
					session: sessionUrl(baseUrl, button.sessionId),
					connect: `${baseUrl}/connect-discord`,
					apply: `${baseUrl}/apply`,
				})
			)
		);
	}

	return Response.json(ephemeralReply("I only handle the buttons on session cards."));
}
