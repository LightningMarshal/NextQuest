"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarSearchIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAvailabilityPoll } from "@/server/availability";

import { useMinDatetimeLocal } from "./create-event-form";

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button disabled={pending}>
			{pending ? <Loader2Icon className="animate-spin" /> : <CalendarSearchIcon />}
			Start poll
		</Button>
	);
}

export function CreatePollForm() {
	const formRef = useRef<HTMLFormElement>(null);
	const [slotKeys, setSlotKeys] = useState<number[]>([0, 1]);
	const nextKey = useRef(2);
	const [error, setError] = useState<string | null>(null);
	const minSlot = useMinDatetimeLocal();

	function addSlot() {
		setSlotKeys((keys) => [...keys, nextKey.current++]);
	}

	function removeSlot(key: number) {
		setSlotKeys((keys) => (keys.length > 1 ? keys.filter((k) => k !== key) : keys));
	}

	async function handleAction(formData: FormData) {
		setError(null);
		// datetime-local is timezone-less; convert in the browser (see
		// create-event-form.tsx for the same dance).
		const isoSlots: string[] = [];
		for (const local of formData.getAll("slotLocal")) {
			const value = String(local);
			if (!value) continue;
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) {
				setError("One of the slots couldn't be read — please re-pick it.");
				return;
			}
			isoSlots.push(date.toISOString());
		}
		formData.delete("slotLocal");
		for (const iso of isoSlots) formData.append("slotStart", iso);
		try {
			await createAvailabilityPoll(formData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong — try again.");
			return;
		}
		formRef.current?.reset();
		setSlotKeys([0, 1]);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Find a time (GAC)</CardTitle>
				<CardDescription>
					Propose a few slots, everyone marks what works, then schedule the winner. You&apos;re
					marked available for every slot you propose.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form ref={formRef} action={handleAction} className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="poll-title">What for</Label>
							<Input id="poll-title" name="title" required maxLength={200} placeholder="Raid night" />
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="poll-duration">Session length</Label>
							<select
								id="poll-duration"
								name="durationMinutes"
								defaultValue="120"
								className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
							>
								<option value="60">1 hour</option>
								<option value="90">1.5 hours</option>
								<option value="120">2 hours</option>
								<option value="180">3 hours</option>
								<option value="240">4 hours</option>
							</select>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Candidate slots</Label>
						{slotKeys.map((key) => (
							<div key={key} className="flex items-center gap-2">
								<Input
									name="slotLocal"
									type="datetime-local"
									required
									min={minSlot}
									step={900}
									className="max-w-xs"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8"
									aria-label="Remove slot"
									disabled={slotKeys.length <= 1}
									onClick={() => removeSlot(key)}
								>
									<XIcon />
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="w-fit"
							disabled={slotKeys.length >= 20}
							onClick={addSlot}
						>
							<PlusIcon />
							Add a slot
						</Button>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div>
						<SubmitButton />
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
