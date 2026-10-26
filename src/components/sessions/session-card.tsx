import Link from "next/link";
import { Gamepad2Icon, GlobeIcon, LockIcon, MapPinIcon, StarIcon } from "lucide-react";

import { Avatar } from "@/components/avatar";
import { GameArt } from "@/components/game-art";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
	canRsvp,
	formatDuration,
	sessionEndsAt,
	sessionPhase,
	summarizeRoster,
} from "@/lib/sessions";
import { cn } from "@/lib/utils";
import type { SessionCardData } from "@/server/sessions-read";

import { RosterFaces } from "./roster";
import { RsvpButtons } from "./rsvp-buttons";
import { SessionWhen } from "./session-when";

export function VisibilityBadge({ visibility }: { visibility: "members" | "open" }) {
	return visibility === "open" ? (
		<Badge variant="outline" className="border-success/40 text-success gap-1">
			<GlobeIcon className="size-3" />
			Open
		</Badge>
	) : (
		<Badge variant="outline" className="text-muted-foreground gap-1">
			<LockIcon className="size-3" />
			Members
		</Badge>
	);
}

/** Upcoming / live session: everything needed to decide, plus one-tap RSVP. */
export function SessionCard({
	session,
	viewerId,
	now,
}: {
	session: SessionCardData;
	viewerId: string;
	now: Date;
}) {
	const phase = sessionPhase(session, now);
	const mine = session.roster.find((entry) => entry.userId === viewerId)?.rsvp ?? null;
	const { full } = summarizeRoster(session.roster, session.capacity);
	const href = `/s/${session.id}`;
	const length = formatDuration(session.durationMinutes);

	return (
		<Card className={cn("gap-0 overflow-hidden py-0", phase === "live" && "border-success/50")}>
			<div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
				<Link href={href} className="relative hidden h-[72px] w-32 shrink-0 overflow-hidden rounded-md sm:block" tabIndex={-1} aria-hidden>
					{session.art ? (
						<GameArt src={session.art} alt="" fill sizes="128px" className="object-cover" />
					) : (
						<span className="bg-muted flex h-full items-center justify-center">
							<Gamepad2Icon className="text-muted-foreground size-6" />
						</span>
					)}
				</Link>
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<h3 className="font-display min-w-0 text-base font-semibold">
							<Link href={href} className="hover:text-primary">
								{session.title}
							</Link>
						</h3>
						<VisibilityBadge visibility={session.visibility} />
					</div>
					<div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
						<SessionWhen date={session.scheduledAt} endsAt={sessionEndsAt(session)} className="text-foreground" />
						{length && <span className="stat text-xs">{length}</span>}
					</div>
					<p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
						{session.gameTitle && session.gameTitle !== session.title && (
							<span className="flex items-center gap-1">
								<Gamepad2Icon className="size-3" />
								{session.gameTitle}
							</span>
						)}
						{session.location && (
							<span className="flex min-w-0 items-center gap-1">
								<MapPinIcon className="size-3 shrink-0" />
								<span className="truncate">{session.location}</span>
							</span>
						)}
						{session.hostName && <span>hosted by {session.hostName}</span>}
					</p>
					<RosterFaces roster={session.roster} capacity={session.capacity} />
					{canRsvp(phase) && <RsvpButtons sessionId={session.id} current={mine} full={full} />}
				</div>
			</div>
		</Card>
	);
}

/** A played (or ended) session: the outcome at a glance. */
export function PastSessionCard({ session, now }: { session: SessionCardData; now: Date }) {
	const phase = sessionPhase(session, now);
	const came = session.roster.filter((entry) => entry.attended === true);
	const href = `/s/${session.id}`;
	return (
		<Card className="gap-2 px-4 py-3">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<Link href={href} className="font-display hover:text-primary font-semibold">
					{session.title}
				</Link>
				{phase === "cancelled" && <Badge variant="destructive">cancelled</Badge>}
				{phase === "ended" && <Badge variant="outline">needs wrap-up</Badge>}
				{session.howItWent !== null && (
					<span className="text-primary flex items-center gap-0.5 text-xs" aria-label={`Rated ${session.howItWent} of 5`}>
						{Array.from({ length: session.howItWent }, (_, i) => (
							<StarIcon key={i} className="size-3 fill-current" />
						))}
					</span>
				)}
				<SessionWhen date={session.scheduledAt} showRelative={false} className="text-muted-foreground ml-auto text-xs" />
			</div>
			{session.recap && <p className="line-clamp-2 text-sm">{session.recap}</p>}
			{came.length > 0 && (
				<div className="flex items-center gap-2">
					<div className="flex -space-x-2">
						{came.slice(0, 8).map((entry) => (
							<Avatar key={entry.userId} name={entry.name} image={entry.image} className="size-6" />
						))}
					</div>
					<span className="text-muted-foreground text-xs">
						{came.length} came{session.autoClosed ? " (from RSVPs — nobody wrapped up)" : ""}
					</span>
				</div>
			)}
		</Card>
	);
}
