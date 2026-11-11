import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { autocompleteReply, commandReplyText, focusedText } from "@/lib/discord-commands";
import {
	DEFERRED_EPHEMERAL,
	ephemeralReply,
	followUpPath,
	interactionUserId,
	InteractionType,
	parseRsvpCustomId,
	PONG,
	REPLY_BUDGET_MS,
	rsvpReplyText,
	verifyDiscordRequest,
	type DiscordInteraction,
	type RsvpOutcome,
} from "@/lib/discord-interactions";
import { escapeMarkdown, sessionUrl } from "@/lib/discord-embed";
import { appBaseUrl, discordApiBase, syncSessionAnnouncement } from "@/server/discord";
import { findDiscordPerson, runPostCommand, runSessionsCommand, suggestGames } from "@/server/discord-commands";
import { applyRsvp } from "@/server/session-rsvp";

// The Discord bot's interactions endpoint: Discord POSTs here when someone
// presses "I'm in" / "Maybe" / "Out" on a session card the bot posted, runs
// /sessions or /post, or types into /post's game option (autocomplete).
// Set it as the application's "Interactions Endpoint URL"
// (docs/deployment/13-discord-bot.md).
//
// This route lives outside every auth gate — there is no browser session.
// Identity comes from two things instead, in this order:
//   1. the Ed25519 signature proves the request is from Discord, so the
//      Discord user id in it is real — this check MUST stay first;
//   2. that Discord id maps to a NextQuest account through Better Auth's
//      `account` table (they signed in with, or connected, Discord).
// From there the normal rules apply: applyRsvp for buttons (guests only
// touch open sessions, no RSVPs to a finished night, atomic seat cap), and
// src/server/discord-commands.ts for commands (guests list open sessions
// only and can't post; the library's titles are suggested to members only).

export const dynamic = "force-dynamic";

function unauthorized(): Response {
	// Discord probes the endpoint with bad signatures and requires a 401.
	return new Response("invalid request signature", { status: 401 });
}

async function resolveRsvp(discordUserId: string, sessionId: string, rsvp: "yes" | "maybe" | "no"): Promise<RsvpOutcome> {
	const db = getDb();
	const person = await findDiscordPerson(db, discordUserId);
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

	const discordUserId = interactionUserId(interaction);
	const baseUrl = appBaseUrl();

	// Autocomplete can't be deferred and has no error state: answer with
	// whatever we have (possibly nothing) and move on.
	if (interaction.type === InteractionType.AUTOCOMPLETE) {
		const typed = focusedText(interaction.data);
		const titles = discordUserId && typed !== null && interaction.data?.name === "post" ? await suggestGames(discordUserId, typed) : [];
		return Response.json(autocompleteReply(titles));
	}

	// Everything else resolves to ONE line only the asker sees. `work` never
	// rejects: Discord shows "This interaction failed" on a non-2xx, and a
	// sentence is kinder.
	let work: Promise<string>;
	if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
		const button = parseRsvpCustomId(interaction.data?.custom_id);
		if (!button || !discordUserId) {
			return Response.json(ephemeralReply("That button isn't something I understand anymore."));
		}
		const sessionLink = sessionUrl(baseUrl, button.sessionId);
		work = resolveRsvp(discordUserId, button.sessionId, button.rsvp)
			.then((outcome) => rsvpReplyText(outcome, { session: sessionLink, connect: `${baseUrl}/connect-discord`, apply: `${baseUrl}/apply` }))
			.catch((error) => {
				console.warn("[discord] interaction failed:", error);
				return `Something went wrong saving that — try on the session page: ${sessionLink}`;
			});
	} else if (interaction.type === InteractionType.APPLICATION_COMMAND && discordUserId) {
		const command = interaction.data?.name;
		if (command !== "sessions" && command !== "post") {
			return Response.json(ephemeralReply("I don't know that command. Try `/sessions` or `/post`."));
		}
		const run =
			command === "sessions"
				? runSessionsCommand(discordUserId, baseUrl)
				: runPostCommand(discordUserId, interaction.data).then((outcome) => {
						if (outcome.kind === "posted") {
							revalidatePath("/");
							revalidatePath("/sessions");
						}
						return outcome;
					});
		work = run
			.then((outcome) => commandReplyText(outcome, baseUrl))
			.catch((error) => {
				console.warn(`[discord] /${command} failed:`, error);
				return `Something went wrong — try on the site: ${baseUrl}/sessions`;
			});
	} else {
		return Response.json(ephemeralReply("I only handle session buttons and the `/sessions` and `/post` commands."));
	}

	// Discord waits 3 seconds. Usually this takes ~50ms and we answer
	// directly; if the database is waking up, answer "thinking…" within
	// the budget and deliver the real line as a follow-up.
	const followUp = followUpPath(interaction);
	if (!followUp) return Response.json(ephemeralReply(await work));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const first = await Promise.race([
		work,
		new Promise<null>((resolve) => {
			timer = setTimeout(() => resolve(null), REPLY_BUDGET_MS);
		}),
	]);
	clearTimeout(timer);
	if (first !== null) return Response.json(ephemeralReply(first));

	const finish = work
		.then((content) =>
			fetch(`${discordApiBase()}${followUp}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } }),
				signal: AbortSignal.timeout(5_000),
			})
		)
		.then((res) => {
			if (!res.ok) console.warn(`[discord] follow-up returned ${res.status}`);
		})
		.catch((error) => console.warn("[discord] follow-up failed:", error));
	const { ctx } = getCloudflareContext();
	if (typeof ctx?.waitUntil === "function") ctx.waitUntil(finish);
	return Response.json(DEFERRED_EPHEMERAL);
}
