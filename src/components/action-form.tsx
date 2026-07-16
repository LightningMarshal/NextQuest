"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

// Wrapper for bare <form action={serverAction}> usages (admin approve/
// reject/role/maintenance buttons): catches a thrown action error and shows
// it inline instead of crashing to the route error boundary. The propose/
// event forms do this ad hoc with local state — this is the same pattern for
// button-only forms.

/** Next's redirect()/notFound() work by throwing — never swallow those. */
function isNextControlFlowError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"digest" in error &&
		typeof (error as { digest: unknown }).digest === "string" &&
		((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
			(error as { digest: string }).digest === "NEXT_NOT_FOUND")
	);
}

function PendingScope({ children }: { children: React.ReactNode }) {
	const { pending } = useFormStatus();
	return <span className={pending ? "pointer-events-none opacity-60" : undefined}>{children}</span>;
}

export function ActionForm({
	action,
	className,
	children,
}: {
	action: () => Promise<void>;
	className?: string;
	children: React.ReactNode;
}) {
	const [error, setError] = useState<string | null>(null);

	return (
		<div className={className}>
			<form
				action={async () => {
					setError(null);
					try {
						await action();
					} catch (err) {
						if (isNextControlFlowError(err)) throw err;
						setError(err instanceof Error ? err.message : "Something went wrong — try again.");
					}
				}}
			>
				<PendingScope>{children}</PendingScope>
			</form>
			{error && <p className="text-destructive mt-1 max-w-52 text-xs">{error}</p>}
		</div>
	);
}
