// Human "when" labels for sessions, computed in a given timezone (the
// browser's, on the client). Pure so it's testable with a fixed clock/zone.

type Parts = { year: number; month: number; day: number };

function dayParts(date: Date, timeZone?: string): Parts {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "numeric",
		day: "numeric",
	}).formatToParts(date);
	const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
	return { year: get("year"), month: get("month"), day: get("day") };
}

function dayNumber(parts: Parts): number {
	return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

export function whenLabel(
	start: Date,
	now: Date,
	options: { timeZone?: string; locale?: string; endsAt?: Date } = {}
): { day: string; time: string; relative: string | null; live: boolean } {
	const { timeZone, locale, endsAt } = options;
	const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(start);
	const diffDays = dayNumber(dayParts(start, timeZone)) - dayNumber(dayParts(now, timeZone));
	const sameYear = dayParts(start, timeZone).year === dayParts(now, timeZone).year;

	let day: string;
	if (diffDays === 0) day = "Today";
	else if (diffDays === 1) day = "Tomorrow";
	else if (diffDays === -1) day = "Yesterday";
	else if (diffDays > 1 && diffDays < 7)
		day = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" }).format(start);
	else
		day = new Intl.DateTimeFormat(locale, {
			timeZone,
			weekday: "short",
			month: "short",
			day: "numeric",
			...(sameYear ? {} : { year: "numeric" }),
		}).format(start);

	const live = start <= now && (!endsAt || now < endsAt);
	const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
	let relative: string | null = null;
	if (live) relative = "live now";
	else if (minutes > 0 && minutes < 60) relative = `in ${minutes} min`;
	else if (minutes >= 60 && minutes < 24 * 60) relative = `in ${Math.round(minutes / 60)}h`;
	return { day, time, relative, live };
}
