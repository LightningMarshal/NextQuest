"use client";

import { useSyncExternalStore } from "react";

// Same hydration-safe pattern as components/local-time.tsx: the server pass
// renders UTC, the client snapshot re-renders in the browser's timezone.
const emptySubscribe = () => () => {};

// useSyncExternalStore compares snapshots with Object.is, so getSnapshot MUST
// return a primitive or a stable reference — returning a fresh object every
// call (as this once did) is never Object.is-equal and spins an infinite
// re-render loop (React error #185). So the snapshot is a "day␟month"
// string, exactly the primitive-snapshot shape local-time.tsx relies on.
const PART_SEP = "␟";

function formatParts(value: Date, utc: boolean): string {
	const options: Intl.DateTimeFormatOptions = utc ? { timeZone: "UTC" } : {};
	const day = new Intl.DateTimeFormat(utc ? "en-US" : undefined, {
		...options,
		day: "numeric",
	}).format(value);
	const month = new Intl.DateTimeFormat(utc ? "en-US" : undefined, {
		...options,
		month: "short",
	}).format(value);
	return `${day}${PART_SEP}${month}`;
}

/* Nova: event date chip — mono cyan day number over a cyan-tint tile. */
export function DateChip({ date }: { date: Date | string }) {
	const value = typeof date === "string" ? new Date(date) : date;
	const snapshot = useSyncExternalStore(
		emptySubscribe,
		() => formatParts(value, false),
		() => formatParts(value, true)
	);
	const [day, month] = snapshot.split(PART_SEP);

	return (
		<time
			dateTime={value.toISOString()}
			className="bg-primary/10 flex size-12 shrink-0 flex-col items-center justify-center rounded-lg"
		>
			<span className="stat text-primary text-lg leading-none font-semibold">{day}</span>
			<span className="text-muted-foreground mt-0.5 text-[10px] leading-none uppercase">
				{month}
			</span>
		</time>
	);
}
