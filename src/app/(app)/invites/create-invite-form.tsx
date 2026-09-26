"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, LinkIcon, Loader2Icon } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createInvite } from "@/server/circle";

function Submit() {
	const { pending } = useFormStatus();
	return (
		<Button disabled={pending}>
			{pending ? <Loader2Icon className="animate-spin" /> : <LinkIcon />}
			Create invite link
		</Button>
	);
}

/** Mint a link and show it ONCE — only its hash is stored, so it can't be shown again. */
export function CreateInviteForm() {
	const [url, setUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	return (
		<div className="flex flex-col gap-4">
			<form
				className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
				action={async (formData) => {
					setError(null);
					setCopied(false);
					try {
						const { path } = await createInvite(formData);
						setUrl(`${window.location.origin}${path}`);
					} catch (err) {
						setError(err instanceof Error ? err.message : "Couldn't create the invite.");
					}
				}}
			>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="invite-note">Who&apos;s it for? (optional)</Label>
					<Input id="invite-note" name="note" maxLength={120} placeholder="Sam's cousin" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="invite-uses">Uses</Label>
					<NativeSelect id="invite-uses" name="maxUses" defaultValue="1">
						{[1, 3, 5, 10, 25].map((n) => (
							<option key={n} value={n}>
								{n} {n === 1 ? "person" : "people"}
							</option>
						))}
					</NativeSelect>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="invite-days">Expires</Label>
					<NativeSelect id="invite-days" name="expiresInDays" defaultValue="7">
						<option value="1">in a day</option>
						<option value="7">in a week</option>
						<option value="30">in a month</option>
					</NativeSelect>
				</div>
				<Submit />
			</form>
			{error && <p role="alert" className="text-destructive text-sm">{error}</p>}
			{url && (
				<div className="border-primary/40 bg-primary/5 flex flex-col gap-2 rounded-lg border p-3">
					<p className="text-sm font-medium">
						Send this link — it&apos;s shown only once. Whoever opens it signs in and joins as a guest.
					</p>
					<div className="flex items-center gap-2">
						<Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="stat h-8 text-xs" aria-label="Invite link" />
						<Button
							size="sm"
							variant="outline"
							className="shrink-0"
							onClick={async () => {
								try {
									await navigator.clipboard.writeText(url);
									setCopied(true);
								} catch {
									// Clipboard blocked — the field is selectable.
								}
							}}
						>
							{copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
							{copied ? "Copied" : "Copy"}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
