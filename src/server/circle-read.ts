// Server-only reads for the circle pages (NOT "use server": a read helper
// exported from an action module becomes a public POST endpoint).

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { sha256Hex } from "@/lib/ids";

export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Server-side lookup for the /invite page: is this token usable? */
export async function describeInvite(token: string): Promise<{
	valid: boolean;
	inviterName: string | null;
}> {
	if (!INVITE_TOKEN_RE.test(token)) return { valid: false, inviterName: null };
	const db = getDb();
	const [invite] = await db
		.select({
			revokedAt: schema.invites.revokedAt,
			expiresAt: schema.invites.expiresAt,
			uses: schema.invites.uses,
			maxUses: schema.invites.maxUses,
			inviterName: schema.user.name,
		})
		.from(schema.invites)
		.leftJoin(schema.user, eq(schema.invites.createdBy, schema.user.id))
		.where(eq(schema.invites.tokenHash, await sha256Hex(token)));
	const valid =
		!!invite &&
		invite.revokedAt === null &&
		invite.expiresAt.getTime() > Date.now() &&
		invite.uses < invite.maxUses;
	return { valid, inviterName: valid ? (invite?.inviterName ?? null) : null };
}

