import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { isInAllowedGuild, parseGuildIds } from "@/lib/discord-guilds";

type AuthEnv = {
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	DISCORD_CLIENT_ID?: string;
	DISCORD_CLIENT_SECRET?: string;
	DISCORD_GUILD_IDS?: string;
	ADMIN_EMAILS?: string;
};

/**
 * Admit a PENDING account as an approved guest. Conditional on status, so it
 * never downgrades a member/admin and never overrides an admin's rejection.
 * Shared by Discord-server admission (below) and invite redemption.
 */
export async function admitPendingAsGuest(
	db: ReturnType<typeof getDb>,
	userId: string
): Promise<boolean> {
	const admitted = await db
		.update(schema.user)
		.set({ role: "guest", status: "approved", updatedAt: new Date() })
		.where(and(eq(schema.user.id, userId), eq(schema.user.status, "pending")))
		.returning({ id: schema.user.id });
	return admitted.length > 0;
}

// Build the auth instance per request: secrets live on the Cloudflare env
// binding, which is only available inside a request context.
// Schema changes here (plugins, additionalFields) must be mirrored in
// src/db/schema/auth.ts — regenerate with `npx @better-auth/cli generate`
// and reconcile rather than hand-drifting.
export function getAuth() {
	const { env } = getCloudflareContext();
	const {
		BETTER_AUTH_SECRET,
		BETTER_AUTH_URL,
		GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET,
		DISCORD_CLIENT_ID,
		DISCORD_CLIENT_SECRET,
		DISCORD_GUILD_IDS,
		ADMIN_EMAILS,
	} = env as AuthEnv;

	const adminEmails = (ADMIN_EMAILS ?? "")
		.split(",")
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
	const allowedGuilds = parseGuildIds(DISCORD_GUILD_IDS);
	const db = getDb();

	// Discord sign-in: members of a configured server come straight in as
	// guests. Runs on account create (first sign-in) and update (every later
	// sign-in refreshes the token), so joining the server after a first
	// pending sign-in works on the next login. Failures leave them pending.
	async function admitDiscordGuildMember(account: {
		providerId: string;
		userId: string;
		accessToken?: string | null;
	}) {
		if (account.providerId !== "discord" || !account.accessToken) return;
		if (await isInAllowedGuild(account.accessToken, allowedGuilds)) {
			await admitPendingAsGuest(db, account.userId);
		}
	}

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification,
			},
		}),
		secret: BETTER_AUTH_SECRET,
		baseURL: BETTER_AUTH_URL,
		// Names and avatars come from Google/Discord only: the public
		// /update-user endpoint would let anyone (e.g. a guest) rename
		// themselves "Alex Ortega" on every roster. The app never uses it.
		disabledPaths: ["/update-user"],
		socialProviders: {
			google: {
				clientId: GOOGLE_CLIENT_ID ?? "",
				clientSecret: GOOGLE_CLIENT_SECRET ?? "",
			},
			...(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET
				? {
						discord: {
							clientId: DISCORD_CLIENT_ID,
							clientSecret: DISCORD_CLIENT_SECRET,
							// `guilds` lists the servers they're in — read once per
							// sign-in for admission, never stored beyond the token.
							scope: ["guilds"],
						},
					}
				: {}),
		},
		user: {
			additionalFields: {
				role: {
					type: "string",
					defaultValue: "member",
					input: false,
				},
				status: {
					type: "string",
					defaultValue: "pending",
					input: false,
				},
			},
		},
		databaseHooks: {
			user: {
				create: {
					// First-admin bootstrap: emails listed in ADMIN_EMAILS skip
					// the approval queue and arrive as approved admins.
					before: async (user) => {
						if (adminEmails.includes(user.email.toLowerCase())) {
							return {
								data: { ...user, role: "admin", status: "approved" },
							};
						}
					},
				},
			},
			account: {
				create: { after: admitDiscordGuildMember },
				update: {
					after: async (account) => {
						// Update payloads may omit providerId/userId; only act on
						// complete ones (a token refresh at sign-in carries them).
						if (typeof account.providerId === "string" && typeof account.userId === "string") {
							await admitDiscordGuildMember(account);
						}
					},
				},
			},
		},
	});
}

export type Auth = ReturnType<typeof getAuth>;

/** Discord sign-in only appears once its OAuth app credentials are set. */
export function discordSignInConfigured(): boolean {
	const { env } = getCloudflareContext();
	const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } = env as AuthEnv;
	return Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
}
