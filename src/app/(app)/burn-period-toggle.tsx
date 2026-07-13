"use client";

import Link from "next/link";

import { BURN_RATE_PERIODS, PERIOD_CONFIG, type BurnRatePeriod } from "@/lib/burn-rate";
import { cn } from "@/lib/utils";

// Segmented control mirroring the backlog SORTS switcher. The URL param drives
// the immediate view; clicking also writes a cookie so the choice carries to
// the next visit (a server component can't set cookies during render).
export function BurnPeriodToggle({ active }: { active: BurnRatePeriod }) {
	function remember(period: BurnRatePeriod) {
		// document.cookie is a browser side-effect in a click handler, not React state.
		// eslint-disable-next-line react-hooks/immutability
		document.cookie = `nq-burn-period=${period}; path=/; max-age=31536000; samesite=lax`;
	}

	return (
		<div className="border-border bg-card flex items-center gap-0.5 rounded-lg border p-0.5 text-xs">
			{BURN_RATE_PERIODS.map((period) => (
				<Link
					key={period}
					href={period === "all" ? "/" : `/?period=${period}`}
					onClick={() => remember(period)}
					className={cn(
						"rounded-md px-2.5 py-1 font-medium transition-colors",
						period === active
							? "bg-primary/12 text-primary"
							: "text-muted-foreground hover:text-foreground"
					)}
				>
					{PERIOD_CONFIG[period].label}
				</Link>
			))}
		</div>
	);
}
