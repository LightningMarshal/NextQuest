"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2Icon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { proposeGame } from "@/server/games";

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button className="glow-primary" disabled={pending}>
			{pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
			{pending ? "Fetching metadata…" : "Propose"}
		</Button>
	);
}

export function ProposeForm() {
	const formRef = useRef<HTMLFormElement>(null);

	async function handleAction(formData: FormData) {
		await proposeGame(formData);
		formRef.current?.reset();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Propose a game</CardTitle>
				<CardDescription>
					Paste a Steam link to auto-fill art, genres, and playtime (HowLongToBeat). If the
					lookups fail, just fill the details in afterwards via &ldquo;Edit scoring&rdquo;.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form ref={formRef} action={handleAction} className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="propose-title">Title</Label>
							<Input id="propose-title" name="title" required maxLength={200} placeholder="Deep Rock Galactic" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="propose-steam">Steam link or app id (optional)</Label>
							<Input
								id="propose-steam"
								name="steam"
								placeholder="https://store.steampowered.com/app/548430/…"
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="propose-pitch">Pitch (optional)</Label>
						<textarea
							id="propose-pitch"
							name="pitch"
							rows={2}
							maxLength={2000}
							placeholder="Why should the group play this?"
							className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
						/>
					</div>
					<div>
						<SubmitButton />
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
