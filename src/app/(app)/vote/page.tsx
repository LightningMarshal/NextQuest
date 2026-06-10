import type { Metadata } from "next";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Vote" };

export default function VotePage() {
	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-semibold tracking-tight">Vote</h1>
			<Card>
				<CardHeader>
					<CardTitle>Coming in Phase 3</CardTitle>
					<CardDescription>
						Anonymous budget-allocation voting: spread your points across backlog games to
						set the group&apos;s priorities. Only aggregate tallies are ever shown.
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}
