"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CheckIcon, HeartIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setKeen } from "@/server/interest";

/** "I'd play this" toggle (game_interest, called "keen" in code) — optimistic; the server re-renders the names. */
export function KeenButton({ gameId, keen, size = "sm" }: { gameId: string; keen: boolean; size?: "sm" | "default" }) {
	const [optimistic, setOptimistic] = useOptimistic(keen);
	const [, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	return (
		<span className="flex flex-col gap-1">
			<Button
				type="button"
				size={size}
				variant={optimistic ? "secondary" : "outline"}
				aria-pressed={optimistic}
				onClick={() => {
					setError(null);
					startTransition(async () => {
						setOptimistic(!optimistic);
						try {
							await setKeen(gameId, !optimistic);
						} catch (err) {
							setError(err instanceof Error ? err.message : "Couldn't save.");
						}
					});
				}}
			>
				{optimistic ? <CheckIcon className="text-primary" /> : <HeartIcon />}
				{optimistic ? "You'd play this" : "I'd play this"}
			</Button>
			{error && <span className="text-destructive text-xs">{error}</span>}
		</span>
	);
}
