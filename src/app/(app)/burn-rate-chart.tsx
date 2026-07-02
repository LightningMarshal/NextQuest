"use client";

import {
	Area,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	ReferenceDot,
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
	const lastActual = series[series.length - 1] ?? null;
	const axisTick = { fill: "var(--muted-foreground)", fontSize: 12, fontFamily: "var(--font-mono)" };

	return (
		<ResponsiveContainer width="100%" height={280}>
			<ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
				<defs>
					{/* Nova: cyan → transparent area wash under the actual line. */}
					<linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
						<stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
					</linearGradient>
				</defs>
				<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
				<XAxis
					dataKey="label"
					tick={axisTick}
					tickLine={false}
					axisLine={{ stroke: "var(--border)" }}
				/>
				<YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} />
				<Tooltip
					contentStyle={{
						backgroundColor: "var(--popover)",
						border: "1px solid var(--border)",
						borderRadius: "var(--radius)",
						color: "var(--popover-foreground)",
						fontSize: 12,
						fontFamily: "var(--font-mono)",
					}}
				/>
				<Legend
					align="right"
					verticalAlign="top"
					iconType="plainline"
					wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
				/>
				<ReferenceLine
					y={totalPoints}
					stroke="var(--muted-foreground)"
					strokeDasharray="4 4"
					label={{
						value: `${totalPoints} total`,
						position: "insideTopRight",
						fill: "var(--muted-foreground)",
						fontSize: 11,
						fontFamily: "var(--font-mono)",
					}}
				/>
				<Area
					type="monotone"
					dataKey="actual"
					name="completed points"
					stroke="var(--chart-1)"
					strokeWidth={2.5}
					fill="url(#burnFill)"
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
				{/* Nova: soft cyan halo on the latest actual point. */}
				{lastActual && (
					<>
						<ReferenceDot
							x={lastActual.label}
							y={lastActual.cumulativePoints}
							r={7}
							fill="var(--chart-1)"
							fillOpacity={0.18}
							stroke="none"
						/>
						<ReferenceDot
							x={lastActual.label}
							y={lastActual.cumulativePoints}
							r={3.5}
							fill="var(--chart-1)"
							stroke="none"
						/>
					</>
				)}
			</ComposedChart>
		</ResponsiveContainer>
	);
}
