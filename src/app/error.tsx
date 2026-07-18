"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Root error boundary. The (app) segment has its own error.tsx, but a
// boundary can't catch errors thrown by its OWN layout — and the (app)
// layout talks to the database on every request (session + settings), so
// a DB outage dies in the layout and lands HERE, not there. Renders inside
// the root layout only: fonts and theme apply, the nav doesn't exist.
export default function RootError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const router = useRouter();
	const [retrying, startTransition] = useTransition();

	useEffect(() => {
		// Surface the real error in the Worker logs (`wrangler tail`).
		console.error(error);
	}, [error]);

	// reset() alone only re-renders the client tree — a server-side failure
	// needs router.refresh() to actually refetch, or retry is a no-op.
	function retry() {
		startTransition(() => {
			router.refresh();
			reset();
		});
	}

	return (
		<div className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-4 text-center">
			<span className="bg-destructive/10 flex size-12 items-center justify-center rounded-lg">
				<TriangleAlertIcon className="text-destructive size-6" />
			</span>
			<div>
				<h1 className="font-display text-xl font-semibold tracking-tight">
					NextQuest couldn&rsquo;t load
				</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Usually temporary — a retry often fixes it. If it keeps happening, tell your admin
					{error.digest && (
						<>
							{" "}
							and mention <code className="stat">{error.digest}</code>
						</>
					)}
					.
				</p>
			</div>
			<Button onClick={retry} disabled={retrying}>
				<RefreshCwIcon className={retrying ? "animate-spin" : undefined} />
				Try again
			</Button>
		</div>
	);
}
