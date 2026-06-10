import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/server/session";

import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "Pending approval" };

export default async function PendingApprovalPage() {
	const user = await getSessionUser();
	if (!user) redirect("/sign-in");
	if (user.status === "approved") redirect("/");

	const rejected = user.status === "rejected";

	return (
		<div className="mx-auto flex max-w-sm flex-col gap-6 pt-16">
			<Card>
				<CardHeader>
					<CardTitle>{rejected ? "Membership declined" : "Hang tight"}</CardTitle>
					<CardDescription>
						{rejected
							? `The admins have declined ${user.email}. If that seems wrong, take it up with them in the group chat.`
							: `You're signed in as ${user.email}, waiting for an admin to approve the account. Pester them in the group chat.`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<SignOutButton />
				</CardContent>
			</Card>
		</div>
	);
}
