import type { Metadata } from "next";
import { asc } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb, schema } from "@/db";
import { approveMember, rejectMember, setMemberRole } from "@/server/members";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Admin" };

type Member = typeof schema.user.$inferSelect;

function MemberRow({
	member,
	selfId,
	children,
}: {
	member: Member;
	selfId: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 py-3">
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-2 truncate text-sm font-medium">
					{member.name}
					{member.role === "admin" && <Badge variant="secondary">admin</Badge>}
					{member.id === selfId && <Badge variant="outline">you</Badge>}
				</p>
				<p className="text-muted-foreground truncate text-xs">{member.email}</p>
			</div>
			<div className="flex shrink-0 gap-2">{children}</div>
		</div>
	);
}

export default async function AdminPage() {
	const admin = await requireAdmin();
	const db = getDb();
	const members = await db.select().from(schema.user).orderBy(asc(schema.user.createdAt));

	const pending = members.filter((m) => m.status === "pending");
	const approved = members.filter((m) => m.status === "approved");
	const rejected = members.filter((m) => m.status === "rejected");

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Approve new sign-ins and manage who runs the place.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Pending approval</CardTitle>
					<CardDescription>
						{pending.length === 0
							? "No one is waiting."
							: "New sign-ins waiting to join the group."}
					</CardDescription>
				</CardHeader>
				{pending.length > 0 && (
					<CardContent className="divide-y">
						{pending.map((member) => (
							<MemberRow key={member.id} member={member} selfId={admin.id}>
								<form action={approveMember.bind(null, member.id)}>
									<Button size="sm">Approve</Button>
								</form>
								<form action={rejectMember.bind(null, member.id)}>
									<Button size="sm" variant="outline">
										Reject
									</Button>
								</form>
							</MemberRow>
						))}
					</CardContent>
				)}
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
					<CardDescription>Everyone with access to the group.</CardDescription>
				</CardHeader>
				<CardContent className="divide-y">
					{approved.map((member) => (
						<MemberRow key={member.id} member={member} selfId={admin.id}>
							{member.id !== admin.id && (
								<>
									<form
										action={setMemberRole.bind(
											null,
											member.id,
											member.role === "admin" ? "member" : "admin"
										)}
									>
										<Button size="sm" variant="outline">
											{member.role === "admin" ? "Remove admin" : "Make admin"}
										</Button>
									</form>
									<form action={rejectMember.bind(null, member.id)}>
										<Button size="sm" variant="ghost">
											Revoke
										</Button>
									</form>
								</>
							)}
						</MemberRow>
					))}
				</CardContent>
			</Card>

			{rejected.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Rejected</CardTitle>
						<CardDescription>Declined accounts — approve to let them in.</CardDescription>
					</CardHeader>
					<CardContent className="divide-y">
						{rejected.map((member) => (
							<MemberRow key={member.id} member={member} selfId={admin.id}>
								<form action={approveMember.bind(null, member.id)}>
									<Button size="sm" variant="outline">
										Approve
									</Button>
								</form>
							</MemberRow>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
