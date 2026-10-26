import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { discordSignInConfigured } from "@/lib/auth";
import { redeemInvite } from "@/server/circle";
import { describeInvite } from "@/server/circle-read";
import { getSessionUser } from "@/server/session";
import { getAppSettings } from "@/server/settings";

import { SocialSignInButton } from "../../sign-in/social-sign-in-button";

export const metadata: Metadata = { title: "You're invited" };

// Public on purpose: this is the one page a signed-out stranger may see.
// It reveals only the inviter's name and the group name, and only for a
// live token. Redemption is a POST (button), never a side effect of GET.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const [invite, user, settings] = await Promise.all([
		describeInvite(token),
		getSessionUser(),
		getAppSettings(),
	]);
	const here = `/invite/${token}`;

	if (!invite.valid) {
		return (
			<Shell title="This invite has expired" description="It may have been used up or revoked. Ask whoever sent it for a fresh link.">
				{user ? <SignOutButton /> : null}
			</Shell>
		);
	}

	const from = invite.inviterName ? `${invite.inviterName} invited you` : "You've been invited";

	if (!user) {
		return (
			<Shell
				title={`${from} to ${settings.groupName}`}
				description="Sign in to see open game sessions and hop into them. It takes a few seconds."
			>
				<SocialSignInButton provider="google" callbackURL={here} />
				{discordSignInConfigured() && <SocialSignInButton provider="discord" callbackURL={here} />}
			</Shell>
		);
	}

	if (user.status === "approved") {
		return (
			<Shell title="You're already in" description={`Signed in as ${user.email}.`}>
				<Button asChild>
					<Link href="/">See what&apos;s on</Link>
				</Button>
			</Shell>
		);
	}

	if (user.status === "rejected") {
		return (
			<Shell title="This account can't use invites" description="An admin declined it earlier — talk to them directly.">
				<SignOutButton />
			</Shell>
		);
	}

	return (
		<Shell
			title={`${from} to ${settings.groupName}`}
			description={`Join as a guest to see and hop into open sessions. Signed in as ${user.email}.`}
		>
			<ActionForm action={redeemInvite.bind(null, token)}>
				<Button className="w-full">Join as a guest</Button>
			</ActionForm>
			<SignOutButton />
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
		<div className="mx-auto flex max-w-sm flex-col gap-6 pt-16">
			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">{children}</CardContent>
			</Card>
		</div>
	);
}
