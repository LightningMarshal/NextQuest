"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
	CalendarDaysIcon,
	Gamepad2Icon,
	SearchIcon,
	SparklesIcon,
	TrendingDownIcon,
	VoteIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markTutorialSeen } from "@/server/tutorial";

// First-time tour (issue #13): a short once-only modal walking a newly
// approved member through the workflow loop. The seen flag lives on the
// user row (server decides whether to auto-open), so it follows them
// across devices; "Replay the tour" in the user menu re-opens it via the
// REPLAY_EVENT custom event — no URL or context plumbing needed between
// two client islands.

export const REPLAY_EVENT = "nq:replay-tour";

const STEPS: {
	icon: typeof SparklesIcon;
	where: string | null;
	title: string;
	body: string;
}[] = [
	{
		icon: SparklesIcon,
		where: null,
		title: "Welcome to NextQuest",
		body: "This is your group's shared game shelf — video games, TTRPGs, and board games in one backlog. The group decides together what to play next; here's the loop in four quick steps.",
	},
	{
		icon: SearchIcon,
		where: "Backlog",
		title: "Propose a game",
		body: "Search by title on the Backlog page and the details fill themselves in — art, genres, and how long it takes (its effort score). Every proposal needs a second: another member adds it to the backlog.",
	},
	{
		icon: VoteIcon,
		where: "What's next?",
		title: "Vote, then let the picker argue for you",
		body: "Spend your vote budget on the games you want — votes are anonymous, only totals show. On game night, tell What's next? how much time you've got and it ranks what actually fits.",
	},
	{
		icon: CalendarDaysIcon,
		where: "Events",
		title: "Schedule the session",
		body: "Plan sessions on Events and RSVP. Nobody can agree on a night? Run a quick find-a-time poll and schedule the winning slot in one click.",
	},
	{
		icon: TrendingDownIcon,
		where: "Dashboard",
		title: "Wrap up & burn it down",
		body: "After a session, record who showed up and how it went. Finishing a game burns its effort points — the dashboard charts the group's march toward backlog zero.",
	},
];

export function WelcomeTour({ initialOpen }: { initialOpen: boolean }) {
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
								<Link href="/backlog" onClick={close}>
									<Gamepad2Icon />
									Propose your first game
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
