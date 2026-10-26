"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlusIcon, CheckIcon, LinkIcon, Loader2Icon, RepeatIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cancelSession, scheduleNextSession } from "@/server/sessions";

export function CopyLinkButton({ path }: { path: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(`${window.location.origin}${path}`);
					setCopied(true);
					setTimeout(() => setCopied(false), 2000);
				} catch {
					// Clipboard blocked — the address bar has the link anyway.
				}
			}}
		>
			{copied ? <CheckIcon className="text-success" /> : <LinkIcon />}
			{copied ? "Copied" : "Copy link"}
		</Button>
	);
}

export function CancelSessionButton({ sessionId }: { sessionId: string }) {
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	return (
		<span className="flex flex-col gap-1">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={pending}
				onClick={() => {
					if (!window.confirm("Cancel this session? Everyone who's in will see it in Discord.")) return;
					setError(null);
					startTransition(async () => {
						try {
							await cancelSession(sessionId);
						} catch (err) {
							setError(err instanceof Error ? err.message : "Couldn't cancel.");
						}
					});
				}}
			>
				{pending ? <Loader2Icon className="animate-spin" /> : <XIcon />}
				Cancel session
			</Button>
			{error && <span className="text-destructive text-xs">{error}</span>}
		</span>
	);
}

export function PlayAgainButton({ sessionId }: { sessionId: string }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	return (
		<span className="flex flex-col gap-1">
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={pending}
				onClick={() =>
					startTransition(async () => {
						try {
							const { id } = await scheduleNextSession(sessionId);
							router.push(`/s/${id}`);
						} catch (err) {
							setError(err instanceof Error ? err.message : "Couldn't schedule.");
						}
					})
				}
			>
				{pending ? <Loader2Icon className="animate-spin" /> : <RepeatIcon />}
				Same time next week
			</Button>
			{error && <span className="text-destructive text-xs">{error}</span>}
		</span>
	);
}

export function AddToCalendarLink({ sessionId }: { sessionId: string }) {
	return (
		<Button variant="outline" size="sm" asChild>
			{/* A plain .ics works in every calendar app — Google, Apple, Outlook. */}
			<a href={`/api/sessions/${sessionId}/ics`} download>
				<CalendarPlusIcon />
				Add to calendar
			</a>
		</Button>
	);
}
