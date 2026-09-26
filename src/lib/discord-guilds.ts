// Discord sign-in admission: someone who signs in with Discord and is a
// member of one of the configured servers (DISCORD_GUILD_IDS) is admitted
// straight in as a guest — the "Discord server members can see and join
// open sessions" half of the circle. Needs the OAuth `guilds` scope.

const GUILDS_ENDPOINT = "https://discord.com/api/users/@me/guilds";

/** "123, 456" → ["123", "456"]; snowflakes only. */
export function parseGuildIds(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter((id) => /^\d{5,25}$/.test(id));
}

/**
 * True when the token's user belongs to any allowed guild. Any failure
 * (network, 401, rate limit, odd payload) is `false`: the person just lands
 * in the normal pending/apply flow — never an error, never a free pass.
 */
export async function isInAllowedGuild(
	accessToken: string,
	allowedGuildIds: string[],
	fetchImpl: typeof fetch = fetch
): Promise<boolean> {
	if (!accessToken || allowedGuildIds.length === 0) return false;
	try {
		const res = await fetchImpl(GUILDS_ENDPOINT, {
			headers: { authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(5_000),
		});
		if (!res.ok) return false;
		const guilds = (await res.json()) as unknown;
		if (!Array.isArray(guilds)) return false;
		const allowed = new Set(allowedGuildIds);
		return guilds.some(
			(guild) =>
				typeof guild === "object" &&
				guild !== null &&
				typeof (guild as { id?: unknown }).id === "string" &&
				allowed.has((guild as { id: string }).id)
		);
	} catch {
		return false;
	}
}
