"use client";

import { useSyncExternalStore } from "react";

// Server (and the hydration pass) renders UTC — it has no idea where the
// reader is; the client snapshot then re-renders in the browser's timezone.
// useSyncExternalStore is the React-sanctioned way to render
// environment-dependent values without hydration warnings.

const emptySubscribe = () => () => {};

type Variant = "datetime" | "weekday-datetime" | "time" | "date";

function formatTime(value: Date, variant: Variant, utc: boolean): string {
	const options: Intl.DateTimeFormatOptions = {
		...(variant !== "date" ? { hour: "numeric", minute: "2-digit" } : {}),
		...(variant !== "time" ? { month: "short", day: "numeric" } : {}),
		...(variant === "weekday-datetime" ? { weekday: "short" } : {}),
		...(utc ? { timeZone: "UTC" } : {}),
	};
	const text = new Intl.DateTimeFormat(utc ? "en-US" : undefined, options).format(value);
	return utc ? `${text} UTC` : text;
}

export function LocalTime({
	date,
	withWeekday = false,
	timeOnly = false,
	dateOnly = false,
}: {
	date: Date | string;
	withWeekday?: boolean;
	timeOnly?: boolean;
	dateOnly?: boolean;
}) {
	const value = typeof date === "string" ? new Date(date) : date;
	const variant: Variant = dateOnly
		? "date"
		: timeOnly
			? "time"
			: withWeekday
				? "weekday-datetime"
				: "datetime";
	const text = useSyncExternalStore(
		emptySubscribe,
		() => formatTime(value, variant, false),
		() => formatTime(value, variant, true)
	);

	return <time dateTime={value.toISOString()}>{text}</time>;
}
