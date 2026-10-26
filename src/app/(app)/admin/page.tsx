import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { ActionForm } from "@/components/action-form";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { getDb, schema } from "@/db";
import { maskWebhookUrl } from "@/lib/webhook-url";
import { reviewApplication, revokeInvite } from "@/server/circle";
import { backfillGameModes } from "@/server/games";
import { approveMember, rejectMember, setMemberRole } from "@/server/members";
import { requireAdmin } from "@/server/session";
import { getAppSettings } from "@/server/settings";
import { addWebhook, deleteWebhook, setWebhookEnabled, testWebhook } from "@/server/webhooks";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Admin" };

type Person = {
	id: string;
	name: string;
	email: string;
	role: "admin" | "member" | "guest";
	status: "pending" | "approved" | "rejected";
	createdAt: Date;
};

function PersonRow({ person, selfId, invitedBy, children }: { person: Person; selfId: string; invitedBy?: string; children?: React.ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-3 py-3">
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-2 truncate text-sm font-medium">
					{person.name}
					{person.role === "admin" && <Badge variant="secondary">admin</Badge>}
					{person.role === "guest" && person.status === "approved" && <Badge variant="outline">guest</Badge>}
					{person.id === selfId && <Badge variant="outline">you</Badge>}
				</p>
				<p className="text-muted-foreground truncate text-xs">
					{person.email}
					{invitedBy && ` · invited by ${invitedBy}`}
				</p>
			</div>
			<div className="flex shrink-0 flex-wrap gap-2">{children}</div>
		</div>
	);
}

// Plain helper (not a component) so Date.now() keeps render pure.
function liveInvitesOnly<T extends { revokedAt: Date | null; expiresAt: Date; uses: number; maxUses: number }>(rows: T[]): T[] {
	const now = Date.now();
	return rows.filter((row) => !row.revokedAt && row.expiresAt.getTime() > now && row.uses < row.maxUses);
}

export default async function AdminPage() {
	const admin = await requireAdmin();
	const db = getDb();
	const inviter = alias(schema.user, "inviter");
	const [people, applications, redemptions, invites, webhooks, settings] = await Promise.all([
		db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				email: schema.user.email,
				role: schema.user.role,
				status: schema.user.status,
				createdAt: schema.user.createdAt,
			})
			.from(schema.user)
			.orderBy(asc(schema.user.name)),
		db
			.select({
				id: schema.membershipApplications.id,
				userId: schema.membershipApplications.userId,
				about: schema.membershipApplications.about,
				reason: schema.membershipApplications.reason,
				knows: schema.membershipApplications.knows,
				createdAt: schema.membershipApplications.createdAt,
			})
			.from(schema.membershipApplications)
			.where(eq(schema.membershipApplications.status, "pending"))
			.orderBy(asc(schema.membershipApplications.createdAt)),
		db
			.select({ userId: schema.inviteRedemptions.userId, inviterName: inviter.name })
			.from(schema.inviteRedemptions)
			.innerJoin(schema.invites, eq(schema.inviteRedemptions.inviteId, schema.invites.id))
			.leftJoin(inviter, eq(schema.invites.createdBy, inviter.id)),
		db
			.select({
				id: schema.invites.id,
				note: schema.invites.note,
				uses: schema.invites.uses,
				maxUses: schema.invites.maxUses,
				expiresAt: schema.invites.expiresAt,
				revokedAt: schema.invites.revokedAt,
				creatorName: inviter.name,
			})
			.from(schema.invites)
			.leftJoin(inviter, eq(schema.invites.createdBy, inviter.id))
			.orderBy(desc(schema.invites.createdAt))
			.limit(50),
		db.select().from(schema.discordWebhooks).orderBy(asc(schema.discordWebhooks.createdAt)),
		getAppSettings(),
	]);
	const byId = new Map(people.map((person) => [person.id, person]));
	const invitedBy = new Map(redemptions.map((row) => [row.userId, row.inviterName ?? "someone"]));
	const applicantIds = new Set(applications.map((a) => a.userId));
	const pendingNoApplication = people.filter((p) => p.status === "pending" && !applicantIds.has(p.id));
	const members = people.filter((p) => p.status === "approved" && p.role !== "guest");
	const guests = people.filter((p) => p.status === "approved" && p.role === "guest");
	const rejected = people.filter((p) => p.status === "rejected");
	const liveInvites = liveInvitesOnly(invites);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-display text-3xl font-semibold tracking-tight">Admin</h1>
				<p className="text-muted-foreground mt-1 text-sm">People, invites, Discord, and group settings.</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Membership applications</CardTitle>
					<CardDescription>
						{applications.length === 0 ? "No applications waiting." : "Approving makes them a full member."}
					</CardDescription>
				</CardHeader>
				{applications.length > 0 && (
					<CardContent className="divide-y">
						{applications.map((application) => {
							const person = byId.get(application.userId);
							if (!person) return null;
							return (
								<div key={application.id} className="flex flex-col gap-2 py-3">
									<PersonRow person={person} selfId={admin.id} invitedBy={invitedBy.get(person.id)}>
										<ActionForm action={reviewApplication.bind(null, application.id, "approved")}>
											<Button size="sm">Approve</Button>
										</ActionForm>
										<ActionForm action={reviewApplication.bind(null, application.id, "declined")}>
											<Button size="sm" variant="outline">
												Decline
											</Button>
										</ActionForm>
									</PersonRow>
									<dl className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
										<dt className="text-muted-foreground">About</dt>
										<dd className="whitespace-pre-line">{application.about}</dd>
										<dt className="text-muted-foreground">Why</dt>
										<dd className="whitespace-pre-line">{application.reason}</dd>
										<dt className="text-muted-foreground">Knows</dt>
										<dd className="whitespace-pre-line">{application.knows}</dd>
										<dt className="text-muted-foreground">Applied</dt>
										<dd>
											<LocalTime date={application.createdAt} />
										</dd>
									</dl>
								</div>
							);
						})}
					</CardContent>
				)}
			</Card>

			{pendingNoApplication.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Signed in, waiting</CardTitle>
						<CardDescription>They signed in but haven&apos;t applied or used an invite yet.</CardDescription>
					</CardHeader>
					<CardContent className="divide-y">
						{pendingNoApplication.map((person) => (
							<PersonRow key={person.id} person={person} selfId={admin.id}>
								<ActionForm action={approveMember.bind(null, person.id, "member")}>
									<Button size="sm">Member</Button>
								</ActionForm>
								<ActionForm action={approveMember.bind(null, person.id, "guest")}>
									<Button size="sm" variant="outline">
										Guest
									</Button>
								</ActionForm>
								<ActionForm action={rejectMember.bind(null, person.id)}>
									<Button size="sm" variant="ghost">
										Reject
									</Button>
								</ActionForm>
							</PersonRow>
						))}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
					<CardDescription>The group: library, planning, stats.</CardDescription>
				</CardHeader>
				<CardContent className="divide-y">
					{members.map((person) => (
						<PersonRow key={person.id} person={person} selfId={admin.id}>
							{person.id !== admin.id && (
								<>
									<ActionForm action={setMemberRole.bind(null, person.id, person.role === "admin" ? "member" : "admin")}>
										<Button size="sm" variant="outline">
											{person.role === "admin" ? "Remove admin" : "Make admin"}
										</Button>
									</ActionForm>
									{person.role !== "admin" && (
										<ActionForm action={setMemberRole.bind(null, person.id, "guest")}>
											<Button size="sm" variant="ghost">
												Make guest
											</Button>
										</ActionForm>
									)}
									<ActionForm action={rejectMember.bind(null, person.id)}>
										<Button size="sm" variant="ghost">
											Revoke
										</Button>
									</ActionForm>
								</>
							)}
						</PersonRow>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Guests</CardTitle>
					<CardDescription>
						{guests.length === 0 ? "No guests yet." : "They see and join open sessions only."}
					</CardDescription>
				</CardHeader>
				{guests.length > 0 && (
					<CardContent className="divide-y">
						{guests.map((person) => (
							<PersonRow key={person.id} person={person} selfId={admin.id} invitedBy={invitedBy.get(person.id)}>
								<ActionForm action={setMemberRole.bind(null, person.id, "member")}>
									<Button size="sm" variant="outline">
										Make member
									</Button>
								</ActionForm>
								<ActionForm action={rejectMember.bind(null, person.id)}>
									<Button size="sm" variant="ghost">
										Revoke
									</Button>
								</ActionForm>
							</PersonRow>
						))}
					</CardContent>
				)}
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Live invite links</CardTitle>
					<CardDescription>Members create these on their Invite page. Revoking stops new sign-ups only.</CardDescription>
				</CardHeader>
				<CardContent className="divide-y">
					{liveInvites.length === 0 && <p className="text-muted-foreground text-sm">None.</p>}
					{liveInvites.map((invite) => (
						<div key={invite.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
							<span className="min-w-0 flex-1 truncate">
								{invite.note ?? "Invite"} <span className="text-muted-foreground">by {invite.creatorName ?? "a former member"}</span>
							</span>
							<span className="stat text-muted-foreground text-xs">
								{invite.uses}/{invite.maxUses} · until <LocalTime date={invite.expiresAt} dateOnly />
							</span>
							<ActionForm action={revokeInvite.bind(null, invite.id)}>
								<Button size="sm" variant="ghost">
									Revoke
								</Button>
							</ActionForm>
						</div>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Discord</CardTitle>
					<CardDescription>
						Each webhook posts one card per session and edits it as people join. &ldquo;Everything&rdquo; is for the
						group&apos;s own server (every session plus game news); &ldquo;Open sessions only&rdquo; is for wider
						servers. Sign-in with Discord for server members is configured with DISCORD_GUILD_IDS (see the deploy docs).
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{webhooks.length > 0 && (
						<div className="divide-y">
							{webhooks.map((hook) => (
								<div key={hook.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
									<span className="min-w-0 flex-1">
										<span className="font-medium">{hook.name}</span>{" "}
										<span className="text-muted-foreground text-xs">{maskWebhookUrl(hook.url)}</span>
									</span>
									<Badge variant="outline">{hook.audience === "open" ? "open sessions only" : "everything"}</Badge>
									{!hook.enabled && <Badge variant="destructive">paused</Badge>}
									<ActionForm action={testWebhook.bind(null, hook.id)}>
										<Button size="sm" variant="outline">
											Test
										</Button>
									</ActionForm>
									<ActionForm action={setWebhookEnabled.bind(null, hook.id, !hook.enabled)}>
										<Button size="sm" variant="ghost">
											{hook.enabled ? "Pause" : "Resume"}
										</Button>
									</ActionForm>
									<ActionForm action={deleteWebhook.bind(null, hook.id)}>
										<Button size="sm" variant="ghost">
											Remove
										</Button>
									</ActionForm>
								</div>
							))}
						</div>
					)}
					<ActionForm action={addWebhook} formClassName="grid gap-3 sm:grid-cols-[10rem_1fr_11rem_auto] sm:items-end" block resetOnSuccess>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="hook-name">Name</Label>
							<Input id="hook-name" name="name" required maxLength={60} placeholder="Main server" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="hook-url">Webhook URL</Label>
							<Input id="hook-url" name="url" type="url" required placeholder="https://discord.com/api/webhooks/…" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="hook-audience">Posts</Label>
							<NativeSelect id="hook-audience" name="audience" defaultValue="all">
								<option value="all">Everything</option>
								<option value="open">Open sessions only</option>
							</NativeSelect>
						</div>
						<Button>Add webhook</Button>
					</ActionForm>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Group settings</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<SettingsForm settings={settings} />
					<div className="flex flex-col gap-1.5 border-t pt-4">
						<ActionForm action={backfillGameModes}>
							<Button variant="outline" size="sm">
								Derive game modes from stored Steam data
							</Button>
						</ActionForm>
						<p className="text-muted-foreground text-xs">
							One-time backfill for the library&apos;s co-op / multiplayer badges from already-fetched Steam data (no
							network).
						</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Data export</CardTitle>
					<CardDescription>
						The group&apos;s history, out of the app: a full JSON snapshot, or per-table CSVs. Legacy votes leave as
						anonymous totals only.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					<Button asChild size="sm">
						<a href="/api/export" download>
							Everything (JSON)
						</a>
					</Button>
					{(["games", "history", "events", "attendance"] as const).map((table) => (
						<Button key={table} asChild size="sm" variant="outline">
							<a href={`/api/export?format=csv&table=${table}`} download>
								{table}.csv
							</a>
						</Button>
					))}
				</CardContent>
			</Card>

			{rejected.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Rejected</CardTitle>
					</CardHeader>
					<CardContent className="divide-y">
						{rejected.map((person) => (
							<PersonRow key={person.id} person={person} selfId={admin.id}>
								<ActionForm action={approveMember.bind(null, person.id, "guest")}>
									<Button size="sm" variant="outline">
										Let in as guest
									</Button>
								</ActionForm>
							</PersonRow>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	);
}


