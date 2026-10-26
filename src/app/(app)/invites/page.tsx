import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { ActionForm } from "@/components/action-form";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb, schema } from "@/db";
import { revokeInvite } from "@/server/circle";
import { requireMember } from "@/server/session";

import { CreateInviteForm } from "./create-invite-form";

export const metadata: Metadata = { title: "Invite friends" };

type InviteRow = { revokedAt: Date | null; expiresAt: Date; uses: number; maxUses: number };

// Plain helper (not a component): Date.now() here keeps render pure per the
// react-hooks rules — this RSC is evaluated once per request.
function withStates<T extends InviteRow>(invites: T[]): (T & { state: string })[] {
	const now = Date.now();
	return invites.map((invite) => ({
		...invite,
		state: invite.revokedAt
			? "revoked"
			: invite.uses >= invite.maxUses
				? "used up"
				: invite.expiresAt.getTime() <= now
					? "expired"
					: "live",
	}));
}

export default async function InvitesPage() {
	const user = await requireMember("/invites");
	const db = getDb();
	const invites = await db
		.select({
			id: schema.invites.id,
			note: schema.invites.note,
			uses: schema.invites.uses,
			maxUses: schema.invites.maxUses,
			expiresAt: schema.invites.expiresAt,
			revokedAt: schema.invites.revokedAt,
			createdAt: schema.invites.createdAt,
		})
		.from(schema.invites)
		.where(eq(schema.invites.createdBy, user.id))
		.orderBy(desc(schema.invites.createdAt))
		.limit(30)
		.then(withStates);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-display text-3xl font-semibold tracking-tight">Invite friends</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					An invite link lets someone sign in and join <strong>open</strong> sessions as a guest —
					no admin approval needed. Guests can&apos;t see the library, stats, or members-only
					sessions, and they can apply to become members later.
				</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>New invite</CardTitle>
				</CardHeader>
				<CardContent>
					<CreateInviteForm />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Your invites</CardTitle>
					<CardDescription>Revoke a link any time — people who already joined stay guests.</CardDescription>
				</CardHeader>
				<CardContent className="divide-y">
					{invites.length === 0 && <p className="text-muted-foreground text-sm">None yet.</p>}
					{invites.map((invite) => {
						const { state } = invite;
						return (
							<div key={invite.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
								<span className="min-w-0 flex-1 truncate">{invite.note ?? "Invite"}</span>
								<span className="stat text-muted-foreground text-xs">
									{invite.uses}/{invite.maxUses} used · expires <LocalTime date={invite.expiresAt} dateOnly />
								</span>
								<Badge variant={state === "live" ? "default" : "outline"}>{state}</Badge>
								{state === "live" && (
									<ActionForm action={revokeInvite.bind(null, invite.id)}>
										<Button size="sm" variant="ghost">
											Revoke
										</Button>
									</ActionForm>
								)}
							</div>
						);
					})}
				</CardContent>
			</Card>
		</div>
	);
}
