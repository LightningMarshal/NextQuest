"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GoogleSignInButton() {
	const [pending, setPending] = useState(false);

	async function handleSignIn() {
		setPending(true);
		try {
			// Redirects to Google; on return, the session lands on "/" and the
			// (app) layout routes unapproved members to /pending-approval.
			await authClient.signIn.social({ provider: "google", callbackURL: "/" });
		} catch {
			setPending(false);
		}
	}

	return (
		<Button className="w-full" onClick={handleSignIn} disabled={pending}>
			{pending && <Loader2Icon className="animate-spin" />}
			Continue with Google
		</Button>
	);
}
