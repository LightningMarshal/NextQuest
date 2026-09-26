"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type Provider = "google" | "discord";

const LABELS: Record<Provider, string> = {
	google: "Continue with Google",
	discord: "Continue with Discord",
};

/**
 * Social sign-in. `callbackURL` is the (already sanitized) path to land on
 * afterwards — a Discord link to a session must come back to that session,
 * not the home page. Unapproved accounts are routed onward by the gates.
 */
export function SocialSignInButton({
	provider,
	callbackURL = "/",
}: {
	provider: Provider;
	callbackURL?: string;
}) {
	const [pending, setPending] = useState(false);

	async function handleSignIn() {
		setPending(true);
		try {
			await authClient.signIn.social({ provider, callbackURL });
		} catch {
			setPending(false);
		}
	}

	return (
		<Button variant="outline" className="w-full" onClick={handleSignIn} disabled={pending}>
			{pending && <Loader2Icon className="animate-spin" />}
			{LABELS[provider]}
		</Button>
	);
}
