"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Profile picture with an initial fallback. Plain <img>: Google/Discord
 * avatar hosts reject optimizer fetches and referrers (issue #7), so no
 * next/image and no referrer.
 */
export function Avatar({
	name,
	image,
	className,
	title,
}: {
	name: string;
	image?: string | null;
	className?: string;
	title?: string;
}) {
	const [failed, setFailed] = useState(false);
	const size = cn("size-7 shrink-0 rounded-full", className);
	if (image && !failed && image.startsWith("https://")) {
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img
				src={image}
				alt={name}
				title={title ?? name}
				referrerPolicy="no-referrer"
				onError={() => setFailed(true)}
				className={cn(size, "ring-background object-cover ring-2")}
			/>
		);
	}
	return (
		<span
			title={title ?? name}
			className={cn(
				size,
				"bg-accent text-accent-foreground ring-background flex items-center justify-center text-xs font-semibold uppercase ring-2"
			)}
		>
			{name.charAt(0) || "?"}
		</span>
	);
}
