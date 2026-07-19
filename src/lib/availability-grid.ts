// Pure interval math for grid availability polls (issue #33): merging
// painted 15-minute cells into stored intervals, coverage tests, and the
// "best window" suggestions the heatmap surfaces. No dates-as-strings, no
// timezone logic — everything here is absolute instants; rendering converts
// to the viewer's local time.

export const CELL_MINUTES = 15;
export const CELL_MS = CELL_MINUTES * 60_000;

export type Interval = { startsAt: Date; endsAt: Date };

/** Sort + merge overlapping/touching intervals; drops empty ones. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
	const sorted = intervals
		.filter((interval) => interval.endsAt.getTime() > interval.startsAt.getTime())
		.slice()
		.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
	const merged: Interval[] = [];
	for (const interval of sorted) {
		const last = merged[merged.length - 1];
		if (last && interval.startsAt.getTime() <= last.endsAt.getTime()) {
			if (interval.endsAt.getTime() > last.endsAt.getTime()) last.endsAt = interval.endsAt;
		} else {
			merged.push({ startsAt: interval.startsAt, endsAt: interval.endsAt });
		}
	}
	return merged;
}

/** Painted cell start-instants (ms) → merged intervals. */
export function cellsToIntervals(cellStartsMs: number[], cellMs: number = CELL_MS): Interval[] {
	return mergeIntervals(
		cellStartsMs.map((start) => ({ startsAt: new Date(start), endsAt: new Date(start + cellMs) }))
	);
}

/** Do the (not necessarily merged) intervals fully cover [start, end)? */
export function covers(intervals: Interval[], start: Date, end: Date): boolean {
	return mergeIntervals(intervals).some(
		(interval) =>
			interval.startsAt.getTime() <= start.getTime() && interval.endsAt.getTime() >= end.getTime()
	);
}

/** Does any interval overlap [start, end) at all? */
export function overlaps(intervals: Interval[], start: Date, end: Date): boolean {
	return intervals.some(
		(interval) =>
			interval.startsAt.getTime() < end.getTime() && interval.endsAt.getTime() > start.getTime()
	);
}

export type MemberMarks = { userId: string; intervals: Interval[] };

export type WindowSuggestion = {
	startsAt: Date;
	endsAt: Date;
	/** Members whose painted availability covers the whole span. */
	available: string[];
};

/**
 * Top non-overlapping candidate spans of `durationMinutes`, slid across the
 * poll's day-windows in cell steps, ranked by how many members' marks fully
 * cover them (earlier start breaks ties). Spans nobody covers are skipped.
 */
export function bestWindows(
	windows: Interval[],
	members: MemberMarks[],
	durationMinutes: number,
	top = 3
): WindowSuggestion[] {
	const durationMs = durationMinutes * 60_000;
	const merged = members.map((member) => ({
		userId: member.userId,
		intervals: mergeIntervals(member.intervals),
	}));

	const candidates: WindowSuggestion[] = [];
	for (const window of windows) {
		for (
			let start = window.startsAt.getTime();
			start + durationMs <= window.endsAt.getTime();
			start += CELL_MS
		) {
			const startsAt = new Date(start);
			const endsAt = new Date(start + durationMs);
			const available = merged
				.filter((member) => covers(member.intervals, startsAt, endsAt))
				.map((member) => member.userId);
			if (available.length > 0) candidates.push({ startsAt, endsAt, available });
		}
	}

	candidates.sort(
		(a, b) =>
			b.available.length - a.available.length || a.startsAt.getTime() - b.startsAt.getTime()
	);

	// Greedy non-overlap pick — otherwise the top three are 15-minute shifts
	// of the same block.
	const picked: WindowSuggestion[] = [];
	for (const candidate of candidates) {
		if (picked.length >= top) break;
		const clashes = picked.some(
			(existing) =>
				candidate.startsAt.getTime() < existing.endsAt.getTime() &&
				candidate.endsAt.getTime() > existing.startsAt.getTime()
		);
		if (!clashes) picked.push(candidate);
	}
	return picked;
}
