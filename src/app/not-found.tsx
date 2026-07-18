import Link from "next/link";
import { CompassIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Styled 404 replacing Next's default black-and-white screen. Server
// component — it must render without a session (signed-out hits land here
// too).
export default function NotFound() {
	return (
		<div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
			<span className="bg-primary/10 flex size-12 items-center justify-center rounded-lg">
				<CompassIcon className="text-primary size-6" />
			</span>
			<div>
				<h1 className="font-display text-xl font-semibold tracking-tight">
					This page doesn&rsquo;t exist
				</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					The link may be stale — a game or event that was removed, or a typo in the address.
				</p>
			</div>
			<Button asChild>
				<Link href="/">Back to the dashboard</Link>
			</Button>
		</div>
	);
}
