"use client";

import { useState } from "react";
import { CalendarPlusIcon, CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Subscribe-once calendar integration (issue #24): the feed URL is pasted
// into Google/Apple Calendar's "add by URL" flow, after which sessions show
// up in everyone's real calendar. The URL embeds the feed token — treat it
// like a key (it can read event titles/times).
export function CalendarSubscribe({ url }: { url: string }) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard unavailable (permissions/http) — the input below is
			// selectable, so manual copy still works.
		}
	}

	return (
		<div className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-4">
			<p className="flex items-center gap-1.5 text-sm font-medium">
				<CalendarPlusIcon className="text-primary size-4" />
				Subscribe in your calendar
			</p>
			<p className="text-muted-foreground text-xs">
				Add this URL in Google Calendar (Other calendars → From URL) or Apple Calendar (File →
				New Calendar Subscription) and sessions appear automatically. Anyone with the URL can
				read event titles and times — share it inside the group only.
			</p>
			<div className="flex items-center gap-2">
				<Input
					readOnly
					value={url}
					onFocus={(event) => event.currentTarget.select()}
					className="stat h-8 text-xs"
					aria-label="Calendar feed URL"
				/>
				<Button size="sm" variant="outline" onClick={copy} className="shrink-0">
					{copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
		</div>
	);
}
