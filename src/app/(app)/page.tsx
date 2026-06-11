import Image from "next/image";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2Icon, LibraryIcon, StarIcon, TrendingUpIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData } from "@/server/dashboard";

import { BurnRateChart } from "./burn-rate-chart";

function StatCard({
	icon: Icon,
	label,
	value,
	detail,
}: {
	icon: typeof LibraryIcon;
	label: string;
	value: string;
	detail?: string;
}) {
	return (
		<Card className="py-4">
			<CardContent className="flex flex-col gap-1 px-5">
				<p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
					<Icon className="size-3.5" />
					{label}
				</p>
				<p className="text-2xl font-semibold tabular-nums">{value}</p>
				{detail && <p className="text-muted-foreground text-xs">{detail}</p>}
			</CardContent>
		</Card>
	);
}

export default async function DashboardPage() {
	const { totals, burnRate, playing } = await getDashboardData();
	const projection = burnRate.projectedCompletionDate
		? { label: format(new Date(burnRate.projectedCompletionDate), "MMM d") }
		: null;

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					{totals.gamesTotal === 0 ? (
						<>
							Nothing tracked yet —{" "}
							<Link href="/backlog" className="underline underline-offset-4">
								propose the first game
							</Link>
							.
						</>
					) : (
						"Group progress at a glance."
					)}
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={TrendingUpIcon}
					label="Completion"
					value={`${totals.completionPct}%`}
					detail={`${totals.completedPoints} of ${totals.totalPoints} points`}
				/>
				<StatCard
					icon={CheckCircle2Icon}
					label="Games finished"
					value={String(totals.gamesCompleted)}
					detail={`of ${totals.gamesTotal} accepted`}
				/>
				<StatCard
					icon={LibraryIcon}
					label="In the backlog"
					value={String(totals.backlogCount)}
					detail={
						totals.unscoredCount > 0
							? `${totals.unscoredCount} still need scoring`
							: undefined
					}
				/>
				<StatCard
					icon={StarIcon}
					label="Burn rate"
					value={burnRate.weeklyRate !== null ? `${burnRate.weeklyRate}/wk` : "—"}
					detail={
						burnRate.projectedCompletionDate
							? `done ~${format(new Date(burnRate.projectedCompletionDate), "MMM d, yyyy")}`
							: "needs more completions"
					}
				/>
			</div>

			{/* Completion bar */}
			{totals.totalPoints > 0 && (
				<div
					className="bg-muted h-2 w-full overflow-hidden rounded-full"
					role="progressbar"
					aria-valuenow={totals.completionPct}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Backlog completion"
				>
					<div
						className="bg-primary h-full rounded-full transition-all"
						style={{ width: `${totals.completionPct}%` }}
					/>
				</div>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Burn rate</CardTitle>
					<CardDescription>
						Cumulative completed points per week
						{projection && " — dashed line projects the current pace"}.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{burnRate.series.length > 0 ? (
						<BurnRateChart
							series={burnRate.series}
							totalPoints={totals.totalPoints}
							projection={projection}
						/>
					) : (
						<p className="text-muted-foreground py-8 text-center text-sm">
							The chart appears once the group completes its first game.
						</p>
					)}
				</CardContent>
			</Card>

			{playing.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="text-sm font-medium tracking-wide uppercase">Now playing</h2>
					<div className="grid gap-4 sm:grid-cols-2">
						{playing.map((game) => (
							<Card key={game.id} className="overflow-hidden py-0">
								<div className="flex items-center gap-4 pr-5">
									{game.art ? (
										<div className="relative h-20 w-40 shrink-0">
											<Image
												src={game.art}
												alt={game.title}
												fill
												className="object-cover"
												sizes="160px"
											/>
										</div>
									) : (
										<div className="bg-muted h-20 w-40 shrink-0" />
									)}
									<div className="min-w-0 py-3">
										<p className="truncate text-sm font-semibold">{game.title}</p>
										<div className="mt-1 flex items-center gap-2">
											{game.points !== null && (
												<Badge variant="secondary" className="gap-1">
													<StarIcon className="size-3" />
													{game.points} pts
												</Badge>
											)}
											{game.startedAt && (
												<span className="text-muted-foreground text-xs">
													started {formatDistanceToNowStrict(game.startedAt, { addSuffix: true })}
												</span>
											)}
										</div>
									</div>
								</div>
							</Card>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
