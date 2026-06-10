import { CalendarIcon, LibraryIcon, TrendingUpIcon, VoteIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const upcoming = [
	{
		icon: LibraryIcon,
		title: "Backlog",
		description: "Group backlog with points, cover art, and completion tracking.",
		phase: "Phase 2",
	},
	{
		icon: VoteIcon,
		title: "Voting",
		description: "Anonymous budget-allocation voting to prioritize what's next.",
		phase: "Phase 3",
	},
	{
		icon: TrendingUpIcon,
		title: "Burn rate",
		description: "Points completed over time with a projected finish date.",
		phase: "Phase 4",
	},
	{
		icon: CalendarIcon,
		title: "Events",
		description: "Session scheduling, RSVPs, and attendance tracking.",
		phase: "Phase 5",
	},
];

export default function DashboardPage() {
	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Group progress at a glance — completion, what&apos;s being played, and what&apos;s
					next. Coming together phase by phase (see docs/ROADMAP.md).
				</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				{upcoming.map((item) => (
					<Card key={item.title}>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<item.icon className="size-4 text-primary" />
								{item.title}
								<Badge variant="secondary" className="ml-auto">
									{item.phase}
								</Badge>
							</CardTitle>
							<CardDescription>{item.description}</CardDescription>
						</CardHeader>
					</Card>
				))}
			</div>
		</div>
	);
}
