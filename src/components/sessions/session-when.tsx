"use client";

import { useSyncExternalStore } from "react";

import { whenLabel } from "@/lib/when-label";
import { cn } from "@/lib/utils";

// Hydration-safe like LocalTime: the server pass renders a UTC fallback,
// the client snapshot re-renders in the browser's zone. The snapshot is a
// primitive string (Object.is-stable) — returning a fresh object from
// getSnapshot is the infinite-render trap DateChip once fell into.

const emptySubscribe = () => () => {};
const SEP = "␟";

function snapshot(start: Date, endsAt: Date | undefined, utc: boolean): string {
	// Minute resolution keeps consecutive getSnapshot calls identical.
	const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
	const label = whenLabel(start, now, { endsAt, ...(utc ? { timeZone: "UTC", locale: "en-US" } : {}) });
	return [label.day, utc ? `${label.time} UTC` : label.time, label.relative ?? "", label.live ? "1" : ""].join(SEP);
}

export function SessionWhen({
	date,
	endsAt,
	className,
	showRelative = true,
}: {
	date: Date | string;
	endsAt?: Date | string;
	className?: string;
	showRelative?: boolean;
}) {
	const start = typeof date === "string" ? new Date(date) : date;
	const end = endsAt ? (typeof endsAt === "string" ? new Date(endsAt) : endsAt) : undefined;
	const value = useSyncExternalStore(
		emptySubscribe,
		() => snapshot(start, end, false),
		() => snapshot(start, end, true)
	);
	const [day, time, relative, live] = value.split(SEP);
	return (
		<time dateTime={start.toISOString()} className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
			<span className="font-medium">{day}</span>
			<span>{time}</span>
			{showRelative && relative && (
				<span className={cn("stat text-xs", live ? "text-success font-semibold" : "text-muted-foreground")}>
					{live ? "● live now" : relative}
				</span>
			)}
		</time>
	);
}
