"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setSessionRsvp } from "@/server/sessions";

type Rsvp = "yes" | "maybe" | "no";

const OPTIONS: { value: Rsvp; label: string }[] = [
	{ value: "yes", label: "I'm in" },
	{ value: "maybe", label: "Maybe" },
	{ value: "no", label: "Out" },
];

/**
 * One-tap RSVP. Optimistic: the pressed state flips immediately and the
 * server re-renders the roster (revalidatePath); a refusal (full, closed)
 * rolls back and says why.
 */
export function RsvpButtons({
	sessionId,
	current,
	full,
	size = "sm",
	className,
}: {
	sessionId: string;
	current: Rsvp | null;
	/** Seats are all taken — "I'm in" is disabled unless you already are. */
	full?: boolean;
	size?: "sm" | "default";
	className?: string;
}) {
	const [optimistic, setOptimistic] = useOptimistic(current);
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function choose(value: Rsvp) {
		if (value === optimistic) return;
		setError(null);
		startTransition(async () => {
			setOptimistic(value);
			try {
				await setSessionRsvp(sessionId, value);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Couldn't save — try again.");
			}
		});
	}

	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your RSVP">
				{OPTIONS.map((option) => {
					const active = optimistic === option.value;
					const disabled = option.value === "yes" && full && current !== "yes";
					return (
						<Button
							key={option.value}
							type="button"
							size={size}
							aria-pressed={active}
							disabled={disabled}
							onClick={() => choose(option.value)}
							variant={active ? (option.value === "yes" ? "default" : "secondary") : "outline"}
							className={cn(
								active && option.value === "yes" && "bg-success text-background hover:bg-success/90",
								option.value === "yes" && !active && "border-success/40"
							)}
						>
							{active && (pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />)}
							{disabled ? "Full" : option.label}
						</Button>
					);
				})}
			</div>
			{error && (
				<p role="alert" className="text-destructive text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
