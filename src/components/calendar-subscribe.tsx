"use client";

import { useState } from "react";
import { CalendarPlusIcon, CheckIcon, CopyIcon } from "lucide-react";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetMyCalendarFeed } from "@/server/calendar";

// Subscribe-once calendar integration: a personal .ics feed URL that works
// in any calendar app. The URL is a key (it can read session titles/times):
// "Reset link" rotates it.
export function CalendarSubscribe({ url }: { url: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-4">
			<p className="flex items-center gap-1.5 text-sm font-medium">
				<CalendarPlusIcon className="text-primary size-4" />
				Put every session in your calendar
			</p>
			<p className="text-muted-foreground text-xs">
				Subscribe to this personal link in any calendar app — Google (Other calendars → From URL), Apple (File → New
				Calendar Subscription), Outlook (Add calendar → From internet) — and sessions appear and update on their own.
				It&apos;s yours alone; reset it if it leaks.
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="stat h-8 min-w-0 flex-1 text-xs" aria-label="Calendar feed URL" />
				<Button
					size="sm"
					variant="outline"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(url);
							setCopied(true);
							setTimeout(() => setCopied(false), 2000);
						} catch {
							// Clipboard blocked — the field is selectable.
						}
					}}
				>
					{copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
					{copied ? "Copied" : "Copy"}
				</Button>
				<ActionForm action={resetMyCalendarFeed}>
					<Button size="sm" variant="ghost">
						Reset link
					</Button>
				</ActionForm>
			</div>
		</div>
	);
}
