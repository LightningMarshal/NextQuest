"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Route error boundary for the members-only pages: catches errors thrown by
// the PAGES below the (app) layout (a page-only query failing, a render bug)
// and keeps the nav visible. Errors thrown by the (app) layout itself — e.g.
// the whole database being down, since the layout resolves the session per
// request — propagate past this to the root boundary (src/app/error.tsx); a
// segment's error.tsx can never catch its own layout's errors.
export default function AppError({
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
		<div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
			<span className="bg-destructive/10 flex size-12 items-center justify-center rounded-lg">
				<TriangleAlertIcon className="text-destructive size-6" />
			</span>
			<div>
				<h1 className="font-display text-xl font-semibold tracking-tight">
					Something broke on this page
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
