import type { Metadata } from "next";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Backlog" };

export default function BacklogPage() {
	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-semibold tracking-tight">Backlog</h1>
			<Card>
				<CardHeader>
					<CardTitle>Coming in Phase 2</CardTitle>
					<CardDescription>
						Game proposals, auto-fetched metadata (Steam + HowLongToBeat), points scoring,
						and the proposed → backlog → playing → completed lifecycle.
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}
