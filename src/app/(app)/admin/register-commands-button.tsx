"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { registerBotCommands } from "@/server/bot-channels";

/**
 * Registers the bot's slash commands with Discord. A client component
 * (unlike the page's other one-button forms) because success needs saying
 * out loud: nothing on the page changes when it works.
 */
export function RegisterCommandsButton() {
	const [pending, startTransition] = useTransition();
	const [result, setResult] = useState<{ ok: true; commands: string[] } | { ok: false; message: string } | null>(null);

	function register() {
		setResult(null);
		startTransition(async () => {
			try {
				const { commands } = await registerBotCommands();
				setResult({ ok: true, commands });
			} catch (error) {
				setResult({ ok: false, message: error instanceof Error ? error.message : "Something went wrong — try again." });
			}
		});
	}

	return (
		<div className="flex flex-col gap-1.5">
			<Button type="button" size="sm" variant="outline" className="self-start" onClick={register} disabled={pending}>
				{pending && <Loader2Icon className="animate-spin" />}
				Set up slash commands
			</Button>
			{result?.ok && (
				<p role="status" className="flex items-center gap-1.5 text-xs">
					<CheckIcon className="text-success size-3.5" aria-hidden />
					Discord now has {result.commands.map((name) => `/${name}`).join(" and ")}. They can take a few minutes to appear.
				</p>
			)}
			{result && !result.ok && (
				<p role="alert" className="text-destructive text-xs">
					{result.message}
				</p>
			)}
		</div>
	);
}
