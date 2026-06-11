"use client";

import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import type { BurnRatePoint } from "@/server/dashboard";

type ChartDatum = {
	label: string;
	actual: number | null;
	projected: number | null;
};

export function BurnRateChart({
	series,
	totalPoints,
	projection,
}: {
	series: BurnRatePoint[];
	totalPoints: number;
	/** End point of the dashed projection segment, if a trend exists. */
	projection: { label: string } | null;
}) {
	const data: ChartDatum[] = series.map((point, index) => ({
		label: point.label,
		actual: point.cumulativePoints,
		// Anchor the projection line at the last actual point.
		projected: projection && index === series.length - 1 ? point.cumulativePoints : null,
	}));
	if (projection) {
		data.push({ label: projection.label, actual: null, projected: totalPoints });
	}

	return (
		<ResponsiveContainer width="100%" height={280}>
			<ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
				<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
				<XAxis
					dataKey="label"
					tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
					tickLine={false}
					axisLine={{ stroke: "var(--border)" }}
				/>
				<YAxis
					tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
					tickLine={false}
					axisLine={false}
					width={36}
				/>
				<Tooltip
					contentStyle={{
						backgroundColor: "var(--popover)",
						border: "1px solid var(--border)",
						borderRadius: "var(--radius)",
						color: "var(--popover-foreground)",
						fontSize: 12,
					}}
				/>
				<ReferenceLine
					y={totalPoints}
					stroke="var(--muted-foreground)"
					strokeDasharray="4 4"
					label={{
						value: `backlog total (${totalPoints})`,
						position: "insideTopRight",
						fill: "var(--muted-foreground)",
						fontSize: 11,
					}}
				/>
				<Area
					type="monotone"
					dataKey="actual"
					name="completed points"
					stroke="var(--chart-1)"
					strokeWidth={2}
					fill="var(--chart-1)"
					fillOpacity={0.15}
					connectNulls={false}
					dot={false}
				/>
				<Line
					type="monotone"
					dataKey="projected"
					name="projected"
					stroke="var(--chart-2)"
					strokeWidth={2}
					strokeDasharray="6 4"
					connectNulls
					dot={false}
				/>
			</ComposedChart>
		</ResponsiveContainer>
	);
}
