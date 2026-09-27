import type { Metadata } from "next";
import Link from "next/link";

import { SessionForm } from "@/components/sessions/session-form";
import { isUuid } from "@/lib/ids";
import { requireMember } from "@/server/session";
import { getPickableGames } from "@/server/sessions-read";

export const metadata: Metadata = { title: "Post a session" };

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
	await requireMember("/sessions/new");
	const { game } = await searchParams;
	const games = await getPickableGames();

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div>
				<h1 className="font-display text-3xl font-semibold tracking-tight">Post a session</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Playing now or planning ahead — pick a game and a time. Can&apos;t agree on a night?{" "}
					<Link href="/sessions/plan" className="underline underline-offset-4">
						Find a time with a poll
					</Link>
					.
				</p>
			</div>
			<SessionForm games={games} defaultGameId={isUuid(game) ? game : undefined} />
		</div>
	);
}
