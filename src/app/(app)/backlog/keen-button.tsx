"use client";

import { useOptimistic, useState, useTransition } from "react";
import { HeartIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setKeen } from "@/server/interest";

/** "I'm keen" toggle — optimistic; the server re-renders the names. */
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
				<HeartIcon className={cn(optimistic && "fill-primary text-primary")} />
				{optimistic ? "Keen" : "I'm keen"}
			</Button>
			{error && <span className="text-destructive text-xs">{error}</span>}
		</span>
	);
}
