import { addWeeks, differenceInCalendarWeeks, format, startOfWeek } from "date-fns";

// Pure burn-rate math, separated from the DB layer (same idea as points.ts).
// Input events come from game_status_history completions; output feeds the
// dashboard chart and projection.

export type CompletionEvent = { changedAt: Date; points: number };

export type BurnRatePoint = {
	/** ISO date of the Monday starting the week. */
	weekStart: string;
	label: string;
	cumulativePoints: number;
};

function weekStart(date: Date): Date {
	return startOfWeek(date, { weekStartsOn: 1 });
}

/** Cumulative completed points bucketed into Monday-start weeks up to `now`. */
export function buildBurnRateSeries(events: CompletionEvent[], now = new Date()): BurnRatePoint[] {
	if (events.length === 0) return [];
	const sorted = [...events].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
	const first = weekStart(sorted[0].changedAt);
	const weekCount = Math.max(differenceInCalendarWeeks(now, first, { weekStartsOn: 1 }), 0) + 1;

	const series: BurnRatePoint[] = [];
	let cumulative = 0;
	let eventIndex = 0;
	for (let week = 0; week < weekCount; week++) {
		const start = addWeeks(first, week);
		const end = addWeeks(start, 1);
		while (eventIndex < sorted.length && sorted[eventIndex].changedAt < end) {
			cumulative += sorted[eventIndex].points;
			eventIndex++;
		}
		series.push({
			weekStart: start.toISOString().slice(0, 10),
			label: format(start, "MMM d"),
			cumulativePoints: cumulative,
		});
	}
	return series;
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
	const lastWeek = new Date(series[series.length - 1].weekStart);
	return {
		date: addWeeks(lastWeek, Math.ceil(weeksLeft)).toISOString().slice(0, 10),
		weeklyRate,
	};
}
