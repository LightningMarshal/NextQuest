"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Attach a Discord identity to the account that's ALREADY signed in
 * (Better Auth's explicit linkSocial) — unlike signing in with Discord,
 * this can't mint a second account when the Discord email differs.
 */
export function ConnectDiscordButton() {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function connect() {
		setPending(true);
		setError(null);
		try {
			const result = await authClient.linkSocial({ provider: "discord", callbackURL: "/connect-discord" });
			if (result?.error) throw new Error(result.error.message ?? "Discord didn't accept that.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't start — try again.");
			setPending(false);
		}
	}

	return (
		<div className="flex flex-col gap-1">
			<Button onClick={connect} disabled={pending} className="self-start">
				{pending && <Loader2Icon className="animate-spin" />}
				Connect Discord
			</Button>
			{error && (
				<p role="alert" className="text-destructive text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
