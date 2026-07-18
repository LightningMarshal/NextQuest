import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { CrownIcon, FlameIcon, QuoteIcon, TrophyIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getYearInReview } from "@/server/review";
import { requireApprovedUser } from "@/server/session";

export const metadata: Metadata = { title: "Year in review" };

// "Year in review" (Phase 20): a fun periodic artifact assembled entirely
// from data the app already stores — completions, sessions, attendance.

function BigStat({ value, label }: { value: string; label: string }) {
	return (
		<div className="bg-muted/50 flex flex-col items-center rounded-lg px-4 py-4 text-center">
			<span className="stat from-primary to-chart-2 bg-gradient-to-r bg-clip-text text-3xl font-semibold text-transparent">
				{value}
			</span>
			<span className="text-muted-foreground mt-1 text-[10px] tracking-wide uppercase">
				{label}
			</span>
		</div>
	);
}

export default async function ReviewPage({
	searchParams,
}: {
	searchParams: Promise<{ year?: string }>;
}) {
	await requireApprovedUser();
	const { year: yearParam } = await searchParams;
	const currentYear = new Date().getUTCFullYear();
	const parsed = Number(yearParam);
	// User-editable param: clamp to something sane, never throw on a GET.
	const year =
		Number.isInteger(parsed) && parsed >= 2000 && parsed <= currentYear ? parsed : currentYear;

	const review = await getYearInReview(year);
	const { totals, finished, bestSession, mostPlayed, presence } = review;
	const years = review.availableYears.includes(currentYear)
		? review.availableYears
		: [currentYear, ...review.availableYears];
	const isEmpty = totals.gamesFinished === 0 && totals.sessionsHeld === 0;

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="font-display text-3xl font-semibold tracking-tight">
					{year} in review
				</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					What the group actually got through this year.
				</p>
				{years.length > 1 && (
					<div className="mt-3 flex flex-wrap gap-1.5">
						{years.map((option) => (
							<Link
								key={option}
								href={`/review?year=${option}`}
								className={cn(
									"stat rounded-full border px-3 py-1 text-xs transition-colors",
									option === year
										? "border-primary/40 bg-primary/12 text-primary"
										: "border-border text-muted-foreground hover:text-foreground"
								)}
							>
								{option}
							</Link>
						))}
					</div>
				)}
			</div>

			{isEmpty ? (
				<Card>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Nothing finished and no sessions wrapped up in {year} — yet. The review writes
							itself as the group plays.
						</p>
					</CardContent>
				</Card>
			) : (
				<>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<BigStat value={String(totals.gamesFinished)} label="games finished" />
						<BigStat value={String(totals.effortBurned)} label="effort burned" />
						<BigStat value={String(totals.sessionsHeld)} label="sessions held" />
						<BigStat
							value={totals.hoursAtTheTable > 0 ? `${totals.hoursAtTheTable}h` : "—"}
							label="at the table"
						/>
					</div>

					{finished.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<TrophyIcon className="size-4" />
									Finished in {year}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<ul className="divide-y">
									{finished.map((game) => (
										<li key={game.id} className="flex items-center gap-3 py-2 text-sm">
											{game.art ? (
												<div className="relative h-10 w-20 shrink-0 overflow-hidden rounded">
													<Image
														src={game.art}
														alt=""
														fill
														className="object-cover"
														sizes="80px"
													/>
												</div>
											) : (
												<div className="bg-muted h-10 w-20 shrink-0 rounded" />
											)}
											<Link
												href={`/backlog/${game.id}`}
												className="hover:text-primary min-w-0 flex-1 truncate font-medium"
											>
												{game.title}
											</Link>
											{game.effort !== null && (
												<Badge variant="secondary" className="stat shrink-0">
													{game.effort} effort
												</Badge>
											)}
											<span className="stat text-muted-foreground shrink-0 text-xs">
												{format(game.completedAt, "MMM d")}
											</span>
										</li>
									))}
								</ul>
								<p className="text-muted-foreground mt-3 text-xs">
									Also this year: {totals.gamesStarted} started, {totals.gamesProposed} proposed
									{totals.averageRating !== null &&
										` · sessions averaged ${totals.averageRating}/5`}
									.
								</p>
							</CardContent>
						</Card>
					)}

					<div className="grid items-start gap-4 sm:grid-cols-2">
						{bestSession && (
							<Card className="border-primary/40">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<QuoteIcon className="size-4" />
										Session of the year
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									<p className="text-sm font-semibold">
										{bestSession.title}
										<span className="stat text-primary ml-2">{bestSession.howItWent}/5</span>
									</p>
									<p className="text-muted-foreground text-xs">
										{format(bestSession.scheduledAt, "MMMM d")}
										{bestSession.gameTitle && ` · ${bestSession.gameTitle}`}
									</p>
									{bestSession.recap && (
										<p className="text-muted-foreground border-primary/30 border-l-2 pl-3 text-sm italic">
											{bestSession.recap}
										</p>
									)}
								</CardContent>
							</Card>
						)}

						{mostPlayed.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<FlameIcon className="size-4" />
										Most at the table
									</CardTitle>
								</CardHeader>
								<CardContent>
									<ul className="divide-y">
										{mostPlayed.map((game) => (
											<li key={game.title} className="flex items-center gap-3 py-2 text-sm">
												<span className="min-w-0 flex-1 truncate font-medium">{game.title}</span>
												<span className="stat text-muted-foreground shrink-0 text-xs">
													{game.sessions} session{game.sessions === 1 ? "" : "s"}
												</span>
											</li>
										))}
									</ul>
								</CardContent>
							</Card>
						)}
					</div>

					{presence.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<CrownIcon className="size-4" />
									Showed up
								</CardTitle>
							</CardHeader>
							<CardContent>
								<ul className="divide-y">
									{presence.map((member, index) => (
										<li key={member.id} className="flex items-center gap-3 py-2 text-sm">
											<span className="stat text-muted-foreground w-5 shrink-0 text-center text-xs">
												{index + 1}
											</span>
											<Link
												href={`/members/${member.id}`}
												className="hover:text-primary min-w-0 flex-1 truncate font-medium"
											>
												{member.name}
											</Link>
											<span className="stat text-muted-foreground shrink-0 text-xs">
												{member.attended} session{member.attended === 1 ? "" : "s"}
											</span>
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	);
}
