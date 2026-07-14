import {
	addMonths,
	addWeeks,
	addYears,
	differenceInCalendarMonths,
	differenceInCalendarWeeks,
	differenceInCalendarYears,
	format,
	startOfMonth,
	startOfWeek,
	startOfYear,
} from "date-fns";

// Pure burn-rate math, separated from the DB layer (same idea as points.ts).
// Input events come from game_status_history completions; output feeds the
// dashboard chart and projection.

export type CompletionEvent = { changedAt: Date; points: number };

export type BurnRatePoint = {
	/** ISO date of the bucket start (Monday for weeks, 1st for months/years). */
	bucketStart: string;
	label: string;
	cumulativePoints: number;
};

/** The x-axis granularity of a burn-rate series. */
export type BurnRateBucket = "week" | "month" | "year";

/** Per-user display preset: which granularity, and how many buckets to keep. */
export type BurnRatePeriod = "weekly" | "monthly" | "yearly" | "all";

export const BURN_RATE_PERIODS: BurnRatePeriod[] = ["weekly", "monthly", "yearly", "all"];

/** Bucket + trailing window for each toggle option. `all` = today's view. */
export const PERIOD_CONFIG: Record<
	BurnRatePeriod,
	{ bucket: BurnRateBucket; trailing: number | null; label: string }
> = {
	weekly: { bucket: "week", trailing: 12, label: "Weekly" },
	monthly: { bucket: "month", trailing: 12, label: "Monthly" },
	yearly: { bucket: "year", trailing: null, label: "Yearly" },
	all: { bucket: "week", trailing: null, label: "All-time" },
};

const BUCKET_OPS: Record<
	BurnRateBucket,
	{
		start: (d: Date) => Date;
		add: (d: Date, n: number) => Date;
		diff: (a: Date, b: Date) => number;
		label: string;
	}
> = {
	week: {
		start: (d) => startOfWeek(d, { weekStartsOn: 1 }),
		add: addWeeks,
		diff: (a, b) => differenceInCalendarWeeks(a, b, { weekStartsOn: 1 }),
		label: "MMM d",
	},
	month: {
		start: startOfMonth,
		add: addMonths,
		diff: differenceInCalendarMonths,
		label: "MMM yyyy",
	},
	year: { start: startOfYear, add: addYears, diff: differenceInCalendarYears, label: "yyyy" },
};

/**
 * Cumulative completed points bucketed by `bucket` (week/month/year) up to
 * `now`, optionally keeping only the last `trailing` buckets. Buckets
 * accumulate from the first completion, so a trailing slice preserves the
 * true cumulative height — earlier points are baked into the first shown
 * bucket.
 */
export function buildBurnRateSeries(
	events: CompletionEvent[],
	{
		bucket = "week",
		trailing = null,
		now = new Date(),
	}: { bucket?: BurnRateBucket; trailing?: number | null; now?: Date } = {}
): BurnRatePoint[] {
	if (events.length === 0) return [];
	const ops = BUCKET_OPS[bucket];
	const sorted = [...events].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
	const first = ops.start(sorted[0].changedAt);
	const bucketCount = Math.max(ops.diff(now, first), 0) + 1;

	const series: BurnRatePoint[] = [];
	let cumulative = 0;
	let eventIndex = 0;
	for (let i = 0; i < bucketCount; i++) {
		const start = ops.add(first, i);
		const end = ops.add(start, 1);
		while (eventIndex < sorted.length && sorted[eventIndex].changedAt < end) {
			cumulative += sorted[eventIndex].points;
			eventIndex++;
		}
		series.push({
			bucketStart: start.toISOString().slice(0, 10),
			label: format(start, ops.label),
			cumulativePoints: cumulative,
		});
	}
	return trailing != null ? series.slice(-trailing) : series;
}

/** Least-squares slope (points/week) over the last 12 weeks; null if flat. */
export function regressionSlope(series: BurnRatePoint[]): number | null {
	const window = series.slice(-12);
	if (window.length < 2) return null;
	const n = window.length;
	const meanX = (n - 1) / 2;
	const meanY = window.reduce((sum, point) => sum + point.cumulativePoints, 0) / n;
	let covariance = 0;
	let variance = 0;
	window.forEach((point, index) => {
		covariance += (index - meanX) * (point.cumulativePoints - meanY);
		variance += (index - meanX) ** 2;
	});
	const slope = covariance / variance;
	return slope > 0.01 ? slope : null;
}

/**
 * Projected completion date at the current pace, or null when there's no
 * usable trend (or the projection lands beyond ~3 years — noise, not
 * forecast).
 */
export function projectCompletionDate(
	series: BurnRatePoint[],
	totalPoints: number,
	completedPoints: number
): { date: string; weeklyRate: number } | null {
	const slope = regressionSlope(series);
	if (!slope) return null;
	const weeklyRate = Math.round(slope * 10) / 10;
	if (totalPoints <= completedPoints) return null;
	const weeksLeft = (totalPoints - completedPoints) / slope;
	if (weeksLeft > 156) return null;
	const lastWeek = new Date(series[series.length - 1].bucketStart);
	return {
		date: addWeeks(lastWeek, Math.ceil(weeksLeft)).toISOString().slice(0, 10),
		weeklyRate,
	};
}
