import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlusIcon, CalendarSearchIcon } from "lucide-react";

import { PastSessionCard, SessionCard } from "@/components/sessions/session-card";
import { CalendarSubscribe } from "@/components/calendar-subscribe";
import { Button } from "@/components/ui/button";
import { myCalendarFeedUrl } from "@/server/calendar-read";
import { isMember, requireCircleUser } from "@/server/session";
import { getSessionsPage } from "@/server/sessions-read";

export const metadata: Metadata = { title: "Sessions" };

function requestNow(): Date {
	return new Date();
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
	const user = await requireCircleUser("/sessions");
	const member = isMember(user);
	const parsed = Number((await searchParams).page);
	const page = Number.isInteger(parsed) && parsed > 0 && parsed < 1000 ? parsed : 0;
	const now = requestNow();
	const [{ upcoming, past, hasMorePast }, feedUrl] = await Promise.all([
		getSessionsPage(user, now, page),
		myCalendarFeedUrl(user.id),
	]);

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="font-display text-3xl font-semibold tracking-tight">Sessions</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Everything coming up, and what happened before.
					</p>
				</div>
				{member && (
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" asChild>
							<Link href="/sessions/plan">
								<CalendarSearchIcon />
								Find a time
							</Link>
						</Button>
						<Button asChild>
							<Link href="/sessions/new">
								<CalendarPlusIcon />
								Post a session
							</Link>
						</Button>
					</div>
				)}
			</header>

			{page === 0 && (
				<section className="flex flex-col gap-3" aria-labelledby="upcoming-heading">
					<h2 id="upcoming-heading" className="text-sm font-medium tracking-wide uppercase">
						Coming up <span className="stat text-muted-foreground ml-1 font-normal">{upcoming.length}</span>
					</h2>
					{upcoming.length === 0 ? (
						<p className="text-muted-foreground text-sm">Nothing scheduled.</p>
					) : (
						upcoming.map((session) => <SessionCard key={session.id} session={session} viewerId={user.id} now={now} />)
					)}
				</section>
			)}

			<section id="past" className="flex flex-col gap-3" aria-labelledby="past-heading">
				<h2 id="past-heading" className="text-sm font-medium tracking-wide uppercase">
					History
				</h2>
				{past.length === 0 ? (
					<p className="text-muted-foreground text-sm">No past sessions yet.</p>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						{past.map((session) => (
							<PastSessionCard key={session.id} session={session} now={now} />
						))}
					</div>
				)}
				<div className="flex gap-3 text-sm">
					{page > 0 && (
						<Link href={page === 1 ? "/sessions#past" : `/sessions?page=${page - 1}#past`} className="underline underline-offset-4">
							Newer
						</Link>
					)}
					{hasMorePast && (
						<Link href={`/sessions?page=${page + 1}#past`} className="underline underline-offset-4">
							Older
						</Link>
					)}
				</div>
			</section>

			{feedUrl && <CalendarSubscribe url={feedUrl} />}
		</div>
	);
}
