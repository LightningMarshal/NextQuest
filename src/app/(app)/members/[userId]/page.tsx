import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { CalendarIcon, DicesIcon, LightbulbIcon, StarIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMemberHistory } from "@/server/member-history";
import { requireApprovedUser } from "@/server/session";

import { GAME_TYPE_LABELS, STATUS_BADGE } from "../../backlog/game-display";

export const metadata: Metadata = { title: "Member" };

// Per-member history (Phase 20): what they proposed, played, and ran.
// Deliberately NO votes anywhere on this page — ballots are anonymous.

function StatTile({ value, label }: { value: string; label: string }) {
	return (
		<div className="bg-muted/50 flex flex-col rounded-lg px-3 py-2">
			<span className="stat text-xl font-semibold">{value}</span>
			<span className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</span>
		</div>
	);
}

export default async function MemberPage({
	params,
}: {
	params: Promise<{ userId: string }>;
}) {
	const viewer = await requireApprovedUser();
	const { userId } = await params;
	const history = await getMemberHistory(userId);
	if (!history) notFound();
	const { profile, stats, proposals, sessions, upcoming, runs } = history;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center gap-4">
				<div
					aria-hidden
					className="bg-primary/15 text-primary flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold"
				>
					{profile.name.charAt(0).toUpperCase()}
				</div>
				<div className="min-w-0">
					<h1 className="font-display flex items-center gap-2 text-3xl font-semibold tracking-tight">
						<span className="truncate">{profile.name}</span>
						{profile.role === "admin" && <Badge variant="secondary">admin</Badge>}
						{profile.id === viewer.id && <Badge variant="outline">you</Badge>}
					</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Member since {format(profile.memberSince, "MMMM yyyy")}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<StatTile value={String(stats.proposals)} label="games proposed" />
				<StatTile
					value={stats.proposals > 0 ? `${stats.proposalsFinished}` : "—"}
					label="of theirs finished"
				/>
				<StatTile
					value={
						stats.completedEventCount > 0
							? `${stats.sessionsAttended}/${stats.completedEventCount}`
							: "—"
					}
					label="sessions attended"
				/>
				<StatTile value={runs.length > 0 ? String(runs.length) : "—"} label="tables run" />
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<LightbulbIcon className="size-4" />
						Proposed
					</CardTitle>
				</CardHeader>
				<CardContent>
					{proposals.length === 0 ? (
						<p className="text-muted-foreground text-sm">Nothing proposed yet.</p>
					) : (
						<ul className="divide-y">
							{proposals.map((game) => {
								const badge = STATUS_BADGE[game.status];
								return (
									<li key={game.id} className="flex items-center gap-3 py-2 text-sm">
										<Link
											href={`/backlog/${game.id}`}
											className="hover:text-primary min-w-0 flex-1 truncate font-medium"
										>
											{game.title}
										</Link>
										{game.gameType !== "video" && (
											<Badge variant="outline" className="text-[10px]">
												{GAME_TYPE_LABELS[game.gameType]}
											</Badge>
										)}
										{game.effort !== null && (
											<span className="stat text-muted-foreground shrink-0 text-xs">
												{game.effort} effort
											</span>
										)}
										<Badge variant={badge.variant}>{badge.label}</Badge>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>

			{runs.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<DicesIcon className="size-4" />
							Runs the table for
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="divide-y">
							{runs.map((game) => {
								const badge = STATUS_BADGE[game.status];
								return (
									<li key={game.id} className="flex items-center gap-3 py-2 text-sm">
										<Link
											href={`/backlog/${game.id}`}
											className="hover:text-primary min-w-0 flex-1 truncate font-medium"
										>
											{game.title}
										</Link>
										{game.system && (
											<span className="text-muted-foreground shrink-0 text-xs">{game.system}</span>
										)}
										<Badge variant={badge.variant}>{badge.label}</Badge>
									</li>
								);
							})}
						</ul>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<CalendarIcon className="size-4" />
						Sessions
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{upcoming.length > 0 && (
						<ul className="divide-y">
							{upcoming.map((event) => (
								<li key={event.id} className="flex items-center gap-3 py-2 text-sm">
									<span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
									<span className="stat text-muted-foreground shrink-0 text-xs">
										{format(event.scheduledAt, "EEE, MMM d")}
									</span>
									<Badge variant={event.rsvp === "yes" ? "default" : "outline"}>
										{event.rsvp === "yes" ? "going" : "maybe"}
									</Badge>
								</li>
							))}
						</ul>
					)}
					{sessions.length === 0 ? (
						<p className="text-muted-foreground text-sm">No sessions attended yet.</p>
					) : (
						<ul className="divide-y">
							{sessions.map((event) => (
								<li key={event.id} className="flex items-center gap-3 py-2 text-sm">
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{event.title}</p>
										{event.gameTitle && (
											<p className="text-muted-foreground truncate text-xs">{event.gameTitle}</p>
										)}
									</div>
									{event.howItWent !== null && (
										<span className="stat text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
											<StarIcon className="text-primary size-3" />
											{event.howItWent}/5
										</span>
									)}
									<span className="stat text-muted-foreground shrink-0 text-xs">
										{format(event.scheduledAt, "MMM d, yyyy")}
									</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
