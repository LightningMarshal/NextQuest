import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { CheckCircle2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb, schema } from "@/db";
import { discordSignInConfigured } from "@/lib/auth";
import { requireCircleUser } from "@/server/session";

import { ConnectDiscordButton } from "./connect-discord-button";

export const metadata: Metadata = { title: "Connect Discord" };

// Where the bot sends someone it doesn't recognise: tie your Discord
// identity to your NextQuest account once, and the "I'm in" buttons on
// session cards work from then on. Guests can use it too.
export default async function ConnectDiscordPage() {
	const user = await requireCircleUser("/connect-discord");
	const [linked] = await getDb()
		.select({ id: schema.account.id })
		.from(schema.account)
		.where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, "discord")));
	const available = discordSignInConfigured();

	return (
		<div className="mx-auto flex max-w-lg flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle className="font-display text-2xl">Connect Discord</CardTitle>
					<CardDescription>
						Session cards in Discord have buttons — I&apos;m in, Maybe, Out. They work once NextQuest knows which
						Discord account is yours.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{linked ? (
						<>
							<p className="flex items-center gap-2 text-sm font-medium">
								<CheckCircle2Icon className="text-success size-5" aria-hidden />
								Your Discord account is connected.
							</p>
							<p className="text-muted-foreground text-sm">
								Head back to Discord and press the button again — it&apos;ll work this time.
							</p>
							<Button variant="outline" asChild className="self-start">
								<Link href="/">See what&apos;s on</Link>
							</Button>
						</>
					) : available ? (
						<>
							<p className="text-sm">
								You&apos;re signed in as <span className="font-medium">{user.name}</span>. Connecting adds Discord to
								this account; nothing else changes.
							</p>
							<ConnectDiscordButton />
						</>
					) : (
						<p className="text-muted-foreground text-sm">
							Discord isn&apos;t set up for this group yet — ask an admin. You can still RSVP on each session&apos;s
							page.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
