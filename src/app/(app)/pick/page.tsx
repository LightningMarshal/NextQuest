import type { Metadata } from "next";
import Link from "next/link";

import { getPickData, parsePickContext } from "@/server/pick";

import { ContextBar } from "./context-bar";
import { PickList, type PickListGame } from "./pick-list";

export const metadata: Metadata = { title: "What's next?" };

export default async function PickPage({
	searchParams,
}: {
	searchParams: Promise<{
		hours?: string;
		commitment?: string;
		players?: string;
		together?: string;
		kind?: string;
	}>;
}) {
	// Session context lives entirely in the URL: every change re-ranks
	// server-side (the (app) layout is force-dynamic) and the link is shareable.
	const ctx = parsePickContext(await searchParams);
	const data = await getPickData(ctx);

	const games = data.ranked
		.map((entry): PickListGame | null => {
			const game = data.games.get(entry.gameId);
			if (!game) return null;
			return {
				id: game.id,
				title: game.title,
				gameType: game.gameType,
				system: game.system,
				art: game.art,
				effort: game.effort,
				lengthHours: game.lengthHours,
				gameModes: game.gameModes,
				playerRange: game.playerRange,
				backlogSince: game.backlogSince,
				groupTotal: game.groupTotal,
				mine: game.mine,
				score: entry.score,
				components: entry.components,
			};
		})
		.filter((game): game is PickListGame => game !== null);

	return (
		<div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
			<div className="text-center">
				<h1 className="font-display text-3xl font-semibold tracking-tight">What&rsquo;s next?</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Tell it about tonight and it ranks the backlog — group interest (anonymous votes),
					acclaim, time fit, and how long a game has been waiting.
				</p>
			</div>

			<ContextBar ctx={ctx} nextEvent={data.nextEvent} />

			{games.length === 0 ? (
				<p className="text-muted-foreground text-center text-sm">
					{ctx.kind !== "any" ? (
						<>No {ctx.kind === "video" ? "video games" : ctx.kind === "ttrpg" ? "TTRPGs" : "board games"} in the backlog — switch the night type or propose one.</>
					) : (
						<>
							Nothing in the backlog to rank yet — move a{" "}
							<Link href="/backlog" className="underline underline-offset-4">
								proposal into the backlog
							</Link>{" "}
							first.
						</>
					)}
				</p>
			) : (
				<PickList
					games={games}
					budget={data.settings.voteBudget}
					maxPerGame={data.settings.voteMaxPerGame}
					hasSessionHours={ctx.sessionHours !== undefined}
				/>
			)}
		</div>
	);
}
