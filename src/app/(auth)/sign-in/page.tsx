import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/server/session";

import { GoogleSignInButton } from "./google-sign-in-button";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
	const user = await getSessionUser();
	if (user) redirect(user.status === "approved" ? "/" : "/pending-approval");

	return (
		<div className="mx-auto flex max-w-sm flex-col gap-6 pt-16">
			<Card>
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
					<CardDescription>
						Sign in with Google to join the group. New accounts need admin approval.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<GoogleSignInButton />
				</CardContent>
			</Card>
		</div>
	);
}
