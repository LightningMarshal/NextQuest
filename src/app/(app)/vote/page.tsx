import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { getMyBallot, getVoteTally } from "@/server/votes";
import { getAppSettings } from "@/server/settings";

import { Ballot, type BallotGame } from "./ballot";

export const metadata: Metadata = { title: "Vote" };

export default async function VotePage() {
	const db = getDb();
	const [rows, ballot, tally, settings] = await Promise.all([
		db
			.select({
				id: schema.games.id,
				title: schema.games.title,
				points: schema.games.points,
				pointsOverride: schema.games.pointsOverride,
				headerUrl: schema.gameMetadata.headerUrl,
				coverUrl: schema.gameMetadata.coverUrl,
			})
			.from(schema.games)
			.leftJoin(schema.gameMetadata, eq(schema.games.id, schema.gameMetadata.gameId))
			.where(eq(schema.games.status, "backlog")),
		getMyBallot(),
		getVoteTally(),
		getAppSettings(),
	]);

	const tallyByGame = new Map(tally.map((entry) => [entry.gameId, entry.totalWeight]));
	const mineByGame = new Map(ballot.allocations.map((entry) => [entry.gameId, entry.weight]));

	const games: BallotGame[] = rows
		.map((row) => ({
			id: row.id,
			title: row.title,
			art: row.headerUrl ?? row.coverUrl,
			points: row.pointsOverride ?? row.points,
			groupTotal: tallyByGame.get(row.id) ?? 0,
			mine: mineByGame.get(row.id) ?? 0,
		}))
		// Group priority first; stable for ties so rows don't jump while voting.
		.sort((a, b) => b.groupTotal - a.groupTotal || a.title.localeCompare(b.title));

	return (
		// Nova: the ballot lives in a narrow centered column (~560px).
		<div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
			<div className="text-center">
				<h1 className="font-display text-3xl font-semibold tracking-tight">Vote</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Anonymous budget voting: put your points on whatever you most want the group to
					play next.
				</p>
			</div>

			{games.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nothing in the backlog to vote on yet — move a{" "}
					<Link href="/backlog" className="underline underline-offset-4">
						proposal into the backlog
					</Link>{" "}
					first.
				</p>
			) : (
				<Ballot
					games={games}
					budget={settings.voteBudget}
					maxPerGame={settings.voteMaxPerGame}
				/>
			)}
		</div>
	);
}
