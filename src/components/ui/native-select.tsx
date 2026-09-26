import * as React from "react";

import { cn } from "@/lib/utils";

/** A styled native <select> — native on purpose: best picker UX on phones. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
	return (
		<select
			data-slot="native-select"
			className={cn(
				"border-input bg-background h-9 w-full rounded-md border px-3 text-base shadow-xs outline-none disabled:opacity-50 md:text-sm",
				"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
				className
			)}
			{...props}
		/>
	);
}

export { NativeSelect };
