import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
	ArrowLeftIcon,
	CalendarPlusIcon,
	ExternalLinkIcon,
	Gamepad2Icon,
	MapPinIcon,
	PencilIcon,
	StarIcon,
	UserIcon,
} from "lucide-react";

import { GameArt } from "@/components/game-art";
import { RosterLists } from "@/components/sessions/roster";
import { RsvpButtons } from "@/components/sessions/rsvp-buttons";
import {
	AddToCalendarLink,
	CancelSessionButton,
	CopyLinkButton,
	PlayAgainButton,
} from "@/components/sessions/session-actions";
import { VisibilityBadge } from "@/components/sessions/session-card";
import { SessionWhen } from "@/components/sessions/session-when";
import { WrapUpForm } from "@/components/sessions/wrap-up-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb, schema } from "@/db";
import { isUuid } from "@/lib/ids";
import {
	canManageSession,
	canRsvp,
	canWrapUp,
	formatDuration,
	safeJoinUrl,
	sessionEndsAt,
	sessionPhase,
	summarizeRoster,
} from "@/lib/sessions";
import { isMember, requireCircleUser } from "@/server/session";
import { getSessionDetail, getPickableGames } from "@/server/sessions-read";

export const metadata: Metadata = { title: "Session" };

const VENUE_LABELS = { virtual: "Online", in_person: "In person", hybrid: "Online + in person" } as const;

function requestNow(): Date {
	return new Date();
}

async function wrapUpCandidates(roster: { userId: string; name: string; rsvp: string | null }[]) {
	// Everyone on the roster plus every member (walk-ins get ticked too).
	const members = await getDb()
		.select({ id: schema.user.id, name: schema.user.name })
		.from(schema.user)
		.where(and(eq(schema.user.status, "approved"), inArray(schema.user.role, ["admin", "member"])))
		.orderBy(asc(schema.user.name));
	const byId = new Map(roster.map((entry) => [entry.userId, { userId: entry.userId, name: entry.name, checked: entry.rsvp === "yes" }]));
	for (const member of members) {
		if (!byId.has(member.id)) byId.set(member.id, { userId: member.id, name: member.name, checked: false });
	}
	return [...byId.values()].sort((a, b) => Number(b.checked) - Number(a.checked) || a.name.localeCompare(b.name));
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const user = await requireCircleUser(`/s/${id}`);
	if (!isUuid(id)) notFound();
	// Missing and not-visible-to-a-guest are the same 404.
	const session = await getSessionDetail(user, id);
	if (!session) notFound();

	const member = isMember(user);
	const now = requestNow();
	const phase = sessionPhase(session, now);
	const mine = session.roster.find((entry) => entry.userId === user.id)?.rsvp ?? null;
	const summary = summarizeRoster(session.roster, session.capacity);
	const manage = canManageSession(session, user);
	const wasIn = mine === "yes";
	const showWrapUp = member && canWrapUp(phase) && (manage || wasIn);
	const joinUrl = safeJoinUrl(session.joinUrl);
	const length = formatDuration(session.durationMinutes);
	const [candidates, games] = showWrapUp
		? await Promise.all([wrapUpCandidates(session.roster), getPickableGames()])
		: [[], []];

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6">
			<Link href="/" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
				<ArrowLeftIcon className="size-4" />
				This week
			</Link>

			<Card className="gap-0 overflow-hidden py-0">
				{session.art && (
					<div className="relative h-40 w-full sm:h-52">
						<GameArt src={session.art} alt="" fill priority sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
						<div className="from-card absolute inset-0 bg-gradient-to-t to-transparent" />
					</div>
				)}
				<div className="flex flex-col gap-4 p-5">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{session.title}</h1>
						<VisibilityBadge visibility={session.visibility} />
						{phase === "live" && <Badge className="bg-success text-background">Live now</Badge>}
						{phase === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
						{phase === "completed" && <Badge variant="secondary">Played</Badge>}
						{phase === "ended" && <Badge variant="outline">Needs wrap-up</Badge>}
					</div>

					<dl className="grid gap-3 text-sm sm:grid-cols-2">
						<div className="flex items-start gap-2">
							<CalendarPlusIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
							<div>
								<dt className="sr-only">When</dt>
								<dd>
									<SessionWhen date={session.scheduledAt} endsAt={sessionEndsAt(session)} showRelative={phase === "upcoming" || phase === "live"} />
									{length && <span className="text-muted-foreground"> · {length}</span>}
								</dd>
							</div>
						</div>
						{session.gameTitle && (
							<div className="flex items-start gap-2">
								<Gamepad2Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
								<div>
									<dt className="sr-only">Game</dt>
									<dd>
										{member && session.gameId ? (
											<Link href={`/backlog/${session.gameId}`} className="hover:text-primary font-medium underline-offset-4 hover:underline">
												{session.gameTitle}
											</Link>
										) : (
											<span className="font-medium">{session.gameTitle}</span>
										)}
										{session.gameGenres && session.gameGenres.length > 0 && (
											<span className="text-muted-foreground"> · {session.gameGenres.slice(0, 3).join(", ")}</span>
										)}
									</dd>
								</div>
							</div>
						)}
						{(session.location || session.venue) && (
							<div className="flex items-start gap-2">
								<MapPinIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
								<div>
									<dt className="sr-only">Where</dt>
									<dd>{[session.venue ? VENUE_LABELS[session.venue] : null, session.location].filter(Boolean).join(" · ")}</dd>
								</div>
							</div>
						)}
						{session.hostName && (
							<div className="flex items-start gap-2">
								<UserIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
								<div>
									<dt className="sr-only">Host</dt>
									<dd>Hosted by {session.hostName}</dd>
								</div>
							</div>
						)}
					</dl>

					{session.notes && <p className="text-sm whitespace-pre-line">{session.notes}</p>}

					{session.lastTime && phase !== "completed" && (
						<p className="border-primary/50 bg-primary/5 rounded-md border-l-2 px-3 py-2 text-sm">
							<span className="font-medium">Last time: </span>
							{session.lastTime.progressNote}
						</p>
					)}

					{!member && session.gameDescription && (
						<details className="text-sm">
							<summary className="text-muted-foreground cursor-pointer select-none">About {session.gameTitle}</summary>
							<p className="text-muted-foreground mt-2 line-clamp-6">{session.gameDescription}</p>
						</details>
					)}

					{canRsvp(phase) && (
						<div className="flex flex-col gap-3 border-t pt-4">
							<RsvpButtons sessionId={session.id} current={mine} full={summary.full} size="default" />
							{joinUrl && (
								<Button asChild variant="secondary" className="self-start">
									<a href={joinUrl} target="_blank" rel="noopener noreferrer">
										<ExternalLinkIcon />
										Open join link
									</a>
								</Button>
							)}
						</div>
					)}

					<div className="flex flex-wrap items-center gap-2">
						{(phase === "upcoming" || phase === "live") && <AddToCalendarLink sessionId={session.id} />}
						<CopyLinkButton path={`/s/${session.id}`} />
						{manage && session.status === "scheduled" && (
							<>
								<Button variant="outline" size="sm" asChild>
									<Link href={`/s/${session.id}/edit`}>
										<PencilIcon />
										Edit
									</Link>
								</Button>
								{phase === "upcoming" && <CancelSessionButton sessionId={session.id} />}
							</>
						)}
					</div>
				</div>
			</Card>

			{phase === "completed" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex flex-wrap items-center gap-2">
							How it went
							{session.howItWent !== null && (
								<span className="text-primary flex items-center" aria-label={`${session.howItWent} of 5`}>
									{Array.from({ length: 5 }, (_, i) => (
										<StarIcon key={i} className={i < (session.howItWent ?? 0) ? "size-4 fill-current" : "text-muted-foreground size-4"} />
									))}
								</span>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 text-sm">
						{session.recap && <p className="whitespace-pre-line">{session.recap}</p>}
						{session.progressNote && (
							<p className="text-muted-foreground whitespace-pre-line">
								<span className="text-foreground font-medium">Where we left off:</span> {session.progressNote}
							</p>
						)}
						<p>
							<span className="font-medium">Came ({summary.came.length}):</span>{" "}
							{summary.came.length > 0 ? summary.came.map((entry) => entry.name).join(", ") : "not recorded"}
						</p>
						<p className="text-muted-foreground text-xs">
							{session.autoClosed
								? "Nobody wrapped this up, so it closed itself after two days — attendance is taken from who said they were in."
								: session.wrappedUpByName
									? `Wrapped up by ${session.wrappedUpByName}.`
									: null}
						</p>
						{member && (
							<div className="flex flex-wrap gap-2">
								<PlayAgainButton sessionId={session.id} />
								<Button variant="ghost" size="sm" asChild>
									<Link href={`/sessions/new${session.gameId ? `?game=${session.gameId}` : ""}`}>Post another</Link>
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{showWrapUp && (
				<Card>
					<CardHeader>
						<CardTitle>Wrap it up</CardTitle>
					</CardHeader>
					<CardContent>
						<WrapUpForm
							sessionId={session.id}
							candidates={candidates}
							games={games}
							gameId={session.gameId}
							isCampaign={session.gameType === "ttrpg"}
						/>
					</CardContent>
				</Card>
			)}

			{phase !== "completed" && (
				<Card>
					<CardHeader>
						<CardTitle>Who&apos;s in</CardTitle>
					</CardHeader>
					<CardContent>
						<RosterLists roster={session.roster} capacity={session.capacity} />
					</CardContent>
				</Card>
			)}
		</div>
	);
}
