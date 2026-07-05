"use client";

import { useFormStatus } from "react-dom";
import { Loader2Icon, SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppSettings } from "@/server/settings";
import { updateAppSettings } from "@/server/settings-actions";

function SubmitButton() {
	const { pending } = useFormStatus();
	return (
		<Button disabled={pending}>
			{pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
			{pending ? "Saving…" : "Save settings"}
		</Button>
	);
}

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;

const PICK_WEIGHT_FIELDS = [
	{ name: "pickInterest", key: "interest", label: "Interest" },
	{ name: "pickTimeFit", key: "timeFit", label: "Time fit" },
	{ name: "pickQuality", key: "quality", label: "Acclaim" },
	{ name: "pickStaleness", key: "staleness", label: "Shelf time" },
	{ name: "pickPartyFit", key: "partyFit", label: "Party fit" },
] as const;

export function SettingsForm({ settings }: { settings: AppSettings }) {
	return (
		<form action={updateAppSettings} className="flex flex-col gap-5">
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="settings-group-name">Group name</Label>
					<Input
						id="settings-group-name"
						name="groupName"
						required
						maxLength={50}
						defaultValue={settings.groupName}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="settings-vote-budget">Vote budget</Label>
					<Input
						id="settings-vote-budget"
						name="voteBudget"
						type="number"
						required
						min={1}
						max={100}
						defaultValue={settings.voteBudget}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="settings-vote-max">Max votes per game</Label>
					<Input
						id="settings-vote-max"
						name="voteMaxPerGame"
						type="number"
						required
						min={1}
						max={100}
						defaultValue={settings.voteMaxPerGame}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Difficulty multipliers</Label>
				<div className="grid grid-cols-5 gap-2">
					{DIFFICULTIES.map((difficulty) => (
						<div key={difficulty} className="flex flex-col gap-1">
							<span className="text-muted-foreground text-center text-xs">{difficulty}</span>
							<Input
								name={`multiplier${difficulty}`}
								type="number"
								required
								step="0.1"
								min={0.1}
								max={10}
								defaultValue={settings.difficultyMultipliers[difficulty]}
								aria-label={`Difficulty ${difficulty} multiplier`}
							/>
						</div>
					))}
				</div>
				<p className="text-muted-foreground text-xs">
					Changing multipliers does not recompute existing points — only future scoring edits use
					the new values.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="settings-quality-weight">Review-score weight</Label>
				<Input
					id="settings-quality-weight"
					name="qualityWeight"
					type="number"
					required
					step="0.05"
					min={0}
					max={1}
					defaultValue={settings.qualityWeight}
					className="w-28"
				/>
				<p className="text-muted-foreground text-xs">
					How strongly Steam/Metacritic scores scale points (0 disables; 0.5 means a 90-rated game
					earns ×1.10). Changing this does not recompute existing points — use the recompute
					button below or future scoring edits.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Picker weights</Label>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
					{PICK_WEIGHT_FIELDS.map((field) => (
						<div key={field.name} className="flex flex-col gap-1">
							<span className="text-muted-foreground text-center text-xs">{field.label}</span>
							<Input
								name={field.name}
								type="number"
								required
								step="0.05"
								min={0}
								max={1}
								defaultValue={settings.pickWeights[field.key]}
								aria-label={`${field.label} pick weight`}
							/>
						</div>
					))}
				</div>
				<p className="text-muted-foreground text-xs">
					How the &ldquo;What&rsquo;s next?&rdquo; ranking mixes its signals. Weights are
					renormalized over whichever components apply to a session (party fit only counts when
					the group says it&rsquo;s playing together), so only the ratios matter.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="settings-milestones">Vote milestones</Label>
				<Input
					id="settings-milestones"
					name="voteMilestones"
					placeholder="5, 10, 15"
					maxLength={200}
					defaultValue={settings.voteMilestones.join(", ")}
				/>
				<p className="text-muted-foreground text-xs">
					Discord pings when a backlog game&rsquo;s vote total first reaches each number; blank
					disables.
				</p>
			</div>

			<div>
				<SubmitButton />
			</div>
		</form>
	);
}
