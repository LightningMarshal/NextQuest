"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

// Wraps <form action={serverAction}>: a thrown action error shows inline
// instead of crashing to the route error boundary, and the controls dim while
// the action runs. Works for button-only forms and forms with fields alike —
// the action receives the FormData either way.

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

function PendingScope({ children, block }: { children: React.ReactNode; block?: boolean }) {
	const { pending } = useFormStatus();
	const Tag = block ? "div" : "span";
	return (
		<Tag
			className={cn(block && "contents", pending && "pointer-events-none opacity-60")}
			aria-busy={pending || undefined}
		>
			{children}
		</Tag>
	);
}

export function ActionForm({
	action,
	className,
	formClassName,
	children,
	resetOnSuccess = false,
	block = false,
}: {
	action: (formData: FormData) => Promise<unknown>;
	className?: string;
	/** Classes for the <form> itself (layout of fields). */
	formClassName?: string;
	children: React.ReactNode;
	/** Clear the fields after a successful submit (composer-style forms). */
	resetOnSuccess?: boolean;
	/** Render the pending wrapper as a block (forms with field layouts). */
	block?: boolean;
}) {
	const [error, setError] = useState<string | null>(null);
	const formRef = useRef<HTMLFormElement>(null);

	return (
		<div className={className}>
			<form
				ref={formRef}
				className={formClassName}
				action={async (formData) => {
					setError(null);
					try {
						await action(formData);
						if (resetOnSuccess) formRef.current?.reset();
					} catch (err) {
						if (isNextControlFlowError(err)) throw err;
						setError(err instanceof Error ? err.message : "Something went wrong — try again.");
					}
				}}
			>
				<PendingScope block={block}>{children}</PendingScope>
			</form>
			{error && (
				<p role="alert" className="text-destructive mt-1 text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
