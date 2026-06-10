import type { Metadata } from "next";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Events" };

export default function EventsPage() {
	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-semibold tracking-tight">Events</h1>
			<Card>
				<CardHeader>
					<CardTitle>Coming in Phase 5</CardTitle>
					<CardDescription>
						Schedule game sessions, RSVP, and track attendance. The Gamer Availability
						Checker (GAC) follows in Phase 6.
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}
