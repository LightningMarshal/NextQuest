import Link from "next/link";
import { CalendarPlusIcon, CalendarSearchIcon, CheckCircle2Icon, UserPlusIcon } from "lucide-react";

import { PastSessionCard, SessionCard } from "@/components/sessions/session-card";
import { SessionWhen } from "@/components/sessions/session-when";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isMember, requireCircleUser } from "@/server/session";
import { getHomeData, getOpenPolls, type SessionCardData } from "@/server/sessions-read";
import { getKeenGames } from "@/server/library-read";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Plain helper, not a component: the request's clock is read once here so
// render stays pure (react-hooks purity rule) and every card agrees on "now".
function requestNow(): Date {
	return new Date();
}

function splitUpcoming(sessions: SessionCardData[], now: Date) {
	const weekOut = now.getTime() + WEEK_MS;
	return {
		thisWeek: sessions.filter((s) => s.scheduledAt.getTime() <= weekOut),
		later: sessions.filter((s) => s.scheduledAt.getTime() > weekOut).slice(0, 5),
	};
}

export default async function HomePage() {
	const user = await requireCircleUser("/");
	const member = isMember(user);
	const now = requestNow();
	const [home, polls, keen] = await Promise.all([
		getHomeData(user, now),
		member ? getOpenPolls() : Promise.resolve([]),
		member ? getKeenGames(5) : Promise.resolve([]),
	]);
	const { thisWeek, later } = splitUpcoming(home.upcoming, now);
	const nothingOn = home.upcoming.length === 0;

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="font-display text-3xl font-semibold tracking-tight">This week</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						{member
							? "What's on, who's in — tap to join. Post a session when you're playing."
							: "Open sessions you can jump into. Tap I'm in and grab the join link."}
					</p>
				</div>
				{member && (
					<Button asChild className="glow-primary">
						<Link href="/sessions/new">
							<CalendarPlusIcon />
							Post a session
						</Link>
					</Button>
				)}
			</header>

			{home.needsWrapUp.length > 0 && (
				<section className="flex flex-col gap-2" aria-labelledby="wrapup-heading">
					<h2 id="wrapup-heading" className="text-sm font-medium tracking-wide uppercase">
						How did it go?
					</h2>
					{home.needsWrapUp.map((session) => (
						<Card key={session.id} className="flex-row flex-wrap items-center gap-3 px-4 py-3">
							<CheckCircle2Icon className="text-primary size-4 shrink-0" />
							<span className="min-w-0 flex-1 text-sm">
								<span className="font-medium">{session.title}</span>{" "}
								<SessionWhen date={session.scheduledAt} showRelative={false} className="text-muted-foreground text-xs" />
							</span>
							<Button size="sm" variant="outline" asChild>
								<Link href={`/s/${session.id}#wrap-up`}>Wrap up</Link>
							</Button>
						</Card>
					))}
				</section>
			)}

			<section className="flex flex-col gap-3" aria-labelledby="week-heading">
				<h2 id="week-heading" className="sr-only">
					Sessions in the next 7 days
				</h2>
				{nothingOn ? (
					<Card className="items-center gap-3 px-6 py-10 text-center">
						<p className="font-display text-lg font-semibold">Nothing on yet</p>
						<p className="text-muted-foreground max-w-sm text-sm">
							{member
								? "Playing something tonight or this weekend? Post it — the group (and Discord) will see it."
								: "No open sessions right now. You'll see them here (and in Discord) when someone posts one."}
						</p>
						{member && (
							<Button asChild>
								<Link href="/sessions/new">
									<CalendarPlusIcon />
									Post a session
								</Link>
							</Button>
						)}
					</Card>
				) : thisWeek.length === 0 ? (
					<p className="text-muted-foreground text-sm">Nothing in the next 7 days.</p>
				) : (
					thisWeek.map((session) => <SessionCard key={session.id} session={session} viewerId={user.id} now={now} />)
				)}
			</section>

			{later.length > 0 && (
				<section className="flex flex-col gap-3" aria-labelledby="later-heading">
					<h2 id="later-heading" className="text-sm font-medium tracking-wide uppercase">
						Later
					</h2>
					{later.map((session) => (
						<SessionCard key={session.id} session={session} viewerId={user.id} now={now} />
					))}
					<Link href="/sessions" className="text-muted-foreground text-sm underline underline-offset-4">
						All sessions
					</Link>
				</section>
			)}

			{member && (polls.length > 0 || keen.length > 0) && (
				<div className="grid gap-4 sm:grid-cols-2">
					{keen.length > 0 && (
						<Card className="gap-2 px-4 py-4">
							<h2 className="text-sm font-medium tracking-wide uppercase">People are keen on</h2>
							<ul className="flex flex-col gap-1.5">
								{keen.map((game) => (
									<li key={game.id} className="flex items-center gap-2 text-sm">
										<Link href={`/backlog/${game.id}`} className="hover:text-primary min-w-0 flex-1 truncate font-medium">
											{game.title}
										</Link>
										<span className="text-muted-foreground text-xs">{game.keen} keen</span>
										<Link href={`/sessions/new?game=${game.id}`} className="text-primary text-xs font-medium">
											Post
										</Link>
									</li>
								))}
							</ul>
						</Card>
					)}
					{polls.length > 0 && (
						<Card className="gap-2 px-4 py-4">
							<h2 className="flex items-center gap-1.5 text-sm font-medium tracking-wide uppercase">
								<CalendarSearchIcon className="size-4" />
								Finding a time
							</h2>
							<ul className="flex flex-col gap-1.5">
								{polls.map((poll) => (
									<li key={poll.id} className="text-sm">
										<Link href={`/sessions/plan#poll-${poll.id}`} className="hover:text-primary font-medium">
											{poll.title}
										</Link>
										<span className="text-muted-foreground text-xs"> — mark when you&apos;re free</span>
									</li>
								))}
							</ul>
						</Card>
					)}
				</div>
			)}

			{home.recent.length > 0 && (
				<section className="flex flex-col gap-3" aria-labelledby="recent-heading">
					<div className="flex items-baseline justify-between">
						<h2 id="recent-heading" className="text-sm font-medium tracking-wide uppercase">
							Recently played
						</h2>
						<Link href="/sessions#past" className="text-muted-foreground text-xs underline underline-offset-4">
							History
						</Link>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						{home.recent.map((session) => (
							<PastSessionCard key={session.id} session={session} now={now} />
						))}
					</div>
				</section>
			)}

			{!member && (
				<Card className="flex-row flex-wrap items-center gap-3 border-dashed px-4 py-3">
					<UserPlusIcon className="text-primary size-4" />
					<p className="text-muted-foreground min-w-0 flex-1 text-sm">
						You&apos;re a guest. Members also get the game library, planning polls, and stats.
					</p>
					<Button size="sm" variant="outline" asChild>
						<Link href="/apply">Apply to join</Link>
					</Button>
				</Card>
			)}
		</div>
	);
}
