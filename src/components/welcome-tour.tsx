"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
	BookOpenIcon,
	CalendarPlusIcon,
	CalendarSearchIcon,
	CheckCircle2Icon,
	HomeIcon,
	SparklesIcon,
	UserPlusIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markTutorialSeen } from "@/server/tutorial";

// First-time tour (issue #13), rewritten for the sessions-first redesign:
// a short once-only modal. The seen stamp lives on the user row; anyone who
// dismissed the OLD tour sees this one once (TOUR_VERSION_DATE). "Replay
// the tour" in the user menu re-opens it via REPLAY_EVENT.

export const REPLAY_EVENT = "nq:replay-tour";

/** Stamps older than this predate the current tour — show it again once. */
export const TOUR_VERSION_DATE = new Date("2026-09-26T00:00:00Z");

type Step = { icon: typeof SparklesIcon; where: string | null; title: string; body: string };

const MEMBER_STEPS: Step[] = [
	{
		icon: SparklesIcon,
		where: null,
		title: "Welcome to NextQuest",
		body: "This is where the group says “I'm playing Rust Tuesday, hop in” — and where the plans, the game library, and the history of every session live.",
	},
	{
		icon: HomeIcon,
		where: "Home",
		title: "What's on, at a glance",
		body: "Home shows what's happening now and this week, who's in, and a one-tap I'm in / Maybe / Out. Discord gets the same card, kept up to date as people join.",
	},
	{
		icon: CalendarPlusIcon,
		where: "Post a session",
		title: "Post in three taps",
		body: "Pick a game, pick a time — right now, tonight, or next month — and choose who can join: open to the wider circle of friends, or members only.",
	},
	{
		icon: CalendarSearchIcon,
		where: "Sessions → Plan",
		title: "Planning ahead? Find a time",
		body: "For bigger nights, open a find-a-time poll: everyone paints when they're free and the best slot becomes a session in one click.",
	},
	{
		icon: BookOpenIcon,
		where: "Library",
		title: "The library",
		body: "Every game with its genres, description, and how long it takes. Mark the ones you're keen on — that's who to ping when someone posts a session.",
	},
	{
		icon: CheckCircle2Icon,
		where: "After",
		title: "Wrap up in ten seconds",
		body: "Afterwards: who came, how it went, same time next week? Forgotten wrap-ups close themselves after two days, so history never has holes.",
	},
];

const GUEST_STEPS: Step[] = [
	{
		icon: SparklesIcon,
		where: null,
		title: "Welcome!",
		body: "You're in as a guest: you can see the group's open sessions and jump into any of them.",
	},
	{
		icon: HomeIcon,
		where: "Home",
		title: "Join with one tap",
		body: "Each session shows when, what, and who's in. Tap I'm in, grab the join link, and add it to your calendar.",
	},
	{
		icon: UserPlusIcon,
		where: "Membership",
		title: "Want the full picture?",
		body: "Members also get the game library, planning polls, and stats. Apply from your account menu whenever you like.",
	},
];

export function WelcomeTour({
	initialOpen,
	variant,
}: {
	initialOpen: boolean;
	variant: "member" | "guest";
}) {
	const STEPS = variant === "guest" ? GUEST_STEPS : MEMBER_STEPS;
	const [open, setOpen] = useState(initialOpen);
	const [step, setStep] = useState(0);
	const panelRef = useRef<HTMLDivElement>(null);
	// The auto-open (not a replay) is the one that needs its dismissal
	// persisted; replays are already marked seen. One stamp is enough.
	const markedRef = useRef(!initialOpen);

	const close = useCallback(() => {
		setOpen(false);
		if (!markedRef.current) {
			markedRef.current = true;
			// Fire-and-forget: a failed stamp just means the tour offers itself
			// again next visit — never worth blocking the dismissal over.
			void markTutorialSeen().catch(() => {});
		}
	}, []);

	useEffect(() => {
		function onReplay() {
			setStep(0);
			setOpen(true);
		}
		window.addEventListener(REPLAY_EVENT, onReplay);
		return () => window.removeEventListener(REPLAY_EVENT, onReplay);
	}, []);

	useEffect(() => {
		if (!open) return;
		panelRef.current?.focus();
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") close();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, close]);

	if (!open) return null;

	const current = STEPS[step];
	const Icon = current.icon;
	const last = step === STEPS.length - 1;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			role="presentation"
		>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="welcome-tour-title"
				tabIndex={-1}
				className="border-border bg-card w-full max-w-md rounded-xl border p-6 shadow-xl outline-none"
			>
				<div className="flex items-start justify-between gap-4">
					<span className="bg-primary/10 flex size-11 items-center justify-center rounded-lg">
						<Icon className="text-primary size-5" />
					</span>
					<span className="stat text-muted-foreground text-xs">
						{step + 1} / {STEPS.length}
						{current.where && (
							<>
								{" · "}
								<span className="text-primary">{current.where}</span>
							</>
						)}
					</span>
				</div>

				<h2 id="welcome-tour-title" className="font-display mt-4 text-xl font-semibold tracking-tight">
					{current.title}
				</h2>
				<p className="text-muted-foreground mt-2 text-sm leading-relaxed">{current.body}</p>

				<div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
					{STEPS.map((_, index) => (
						<button
							key={index}
							type="button"
							tabIndex={-1}
							onClick={() => setStep(index)}
							className={cn(
								"size-1.5 cursor-pointer rounded-full transition-colors",
								index === step ? "bg-primary" : "bg-muted-foreground/30"
							)}
						/>
					))}
				</div>

				<div className="mt-5 flex items-center gap-2">
					<Button variant="ghost" size="sm" onClick={close} className="text-muted-foreground">
						Skip tour
					</Button>
					<div className="ml-auto flex items-center gap-2">
						{step > 0 && (
							<Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
								Back
							</Button>
						)}
						{last ? (
							<Button size="sm" className="glow-primary" asChild>
								<Link href={variant === "guest" ? "/" : "/sessions/new"} onClick={close}>
									{variant === "guest" ? <HomeIcon /> : <CalendarPlusIcon />}
									{variant === "guest" ? "See what's on" : "Post a session"}
								</Link>
							</Button>
						) : (
							<Button size="sm" onClick={() => setStep(step + 1)}>
								Next
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
