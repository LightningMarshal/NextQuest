"use client";

import { useSyncExternalStore } from "react";

// Same hydration-safe pattern as components/local-time.tsx: the server pass
// renders UTC, the client snapshot re-renders in the browser's timezone.
const emptySubscribe = () => () => {};

function formatParts(value: Date, utc: boolean): { day: string; month: string } {
	const options: Intl.DateTimeFormatOptions = utc ? { timeZone: "UTC" } : {};
	return {
		day: new Intl.DateTimeFormat(utc ? "en-US" : undefined, {
			...options,
			day: "numeric",
		}).format(value),
		month: new Intl.DateTimeFormat(utc ? "en-US" : undefined, {
			...options,
			month: "short",
		}).format(value),
	};
}

/* Nova: event date chip — mono cyan day number over a cyan-tint tile. */
export function DateChip({ date }: { date: Date | string }) {
	const value = typeof date === "string" ? new Date(date) : date;
	const parts = useSyncExternalStore(
		emptySubscribe,
		() => formatParts(value, false),
		() => formatParts(value, true)
	);

	return (
		<time
			dateTime={value.toISOString()}
			className="bg-primary/10 flex size-12 shrink-0 flex-col items-center justify-center rounded-lg"
		>
			<span className="stat text-primary text-lg leading-none font-semibold">{parts.day}</span>
			<span className="text-muted-foreground mt-0.5 text-[10px] leading-none uppercase">
				{parts.month}
			</span>
		</time>
	);
}
