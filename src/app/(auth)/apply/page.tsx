import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { ActionForm } from "@/components/action-form";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDb, schema } from "@/db";
import { submitApplication } from "@/server/circle";
import { getSessionUser } from "@/server/session";
import { getAppSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Join the group" };

// Where everyone without full access lands: pending sign-ins (who can apply
// or use an invite link), rejected accounts, and guests who want to become
// members. Members are bounced home.
export default async function ApplyPage() {
	const user = await getSessionUser();
	if (!user) redirect("/sign-in?next=/apply");
	if (user.status === "approved" && user.role !== "guest") redirect("/");

	const db = getDb();
	const [[latest], settings] = await Promise.all([
		db
			.select({ status: schema.membershipApplications.status })
			.from(schema.membershipApplications)
			.where(eq(schema.membershipApplications.userId, user.id))
			.orderBy(desc(schema.membershipApplications.createdAt))
			.limit(1),
		getAppSettings(),
	]);
	const pendingApplication = latest?.status === "pending";
	const isGuest = user.status === "approved" && user.role === "guest";

	if (user.status === "rejected") {
		return (
			<Shell title="Not this time" description={`The admins have declined ${user.email}. If that seems wrong, take it up with them directly.`}>
				<SignOutButton />
			</Shell>
		);
	}

	if (pendingApplication) {
		return (
			<Shell
				title="Application received"
				description={`Thanks! The ${settings.groupName} admins will review it. ${isGuest ? "Meanwhile you can keep joining open sessions." : "If someone sent you an invite link, open it to join open sessions right away."}`}
			>
				{isGuest ? (
					<Button asChild>
						<Link href="/">Back to sessions</Link>
					</Button>
				) : (
					<SignOutButton />
				)}
			</Shell>
		);
	}

	return (
		<Shell
			title={isGuest ? `Become a member of ${settings.groupName}` : `Join ${settings.groupName}`}
			description={
				isGuest
					? "Guests can see and join open sessions. Members also get the game library, planning, and stats. Tell the admins a bit about you."
					: `You're signed in as ${user.email}. Got an invite link from someone in the group? Open it and you're in as a guest right away. Otherwise, apply below and an admin will review it.`
			}
		>
			<ActionForm action={submitApplication} formClassName="flex flex-col gap-4" block>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="apply-about">Who are you?</Label>
					<Textarea id="apply-about" name="about" required maxLength={1000} rows={2} placeholder="Name you go by, what you like to play…" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="apply-reason">Why do you want to join?</Label>
					<Textarea id="apply-reason" name="reason" required maxLength={1000} rows={2} />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="apply-knows">Who do you know in the group?</Label>
					<Textarea id="apply-knows" name="knows" required maxLength={300} rows={1} placeholder="e.g. Sam from work, Brooke's brother" />
				</div>
				<Button className="self-start">Send application</Button>
			</ActionForm>
			<div className="border-t pt-4">
				{isGuest ? (
					<Link href="/" className="text-muted-foreground text-sm underline underline-offset-4">
						Back to sessions
					</Link>
				) : (
					<SignOutButton />
				)}
			</div>
		</Shell>
	);
}

function Shell({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="mx-auto flex max-w-md flex-col gap-6 py-12">
			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">{children}</CardContent>
			</Card>
		</div>
	);
}
