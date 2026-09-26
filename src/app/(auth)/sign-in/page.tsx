import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChevronMark } from "@/components/chevron-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { discordSignInConfigured } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/session";

import { SocialSignInButton } from "./social-sign-in-button";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	const next = safeNextPath((await searchParams).next);
	const user = await getSessionUser();
	if (user) redirect(user.status === "approved" ? next : "/pending-approval");

	return (
		<div className="mx-auto flex max-w-sm flex-col gap-6 pt-16">
			<Card>
				<CardHeader className="items-center text-center">
					<ChevronMark className="text-foreground size-9" />
					<CardTitle className="text-lg">Welcome to NextQuest</CardTitle>
					<CardDescription>
						Sign in to see what the group is playing and jump in. Got an invite link? Open it
						first — it lets you straight in.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<SocialSignInButton provider="google" callbackURL={next} />
					{discordSignInConfigured() && <SocialSignInButton provider="discord" callbackURL={next} />}
				</CardContent>
			</Card>
		</div>
	);
}
