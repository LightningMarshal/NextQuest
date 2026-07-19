"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb, schema } from "@/db";
import type { PickWeights } from "@/lib/pick";
import type { DifficultyMultipliers } from "@/lib/points";
import { requireAdmin } from "@/server/session";

// Kept separate from settings.ts on purpose: that module's getAppSettings()
// is an ungated read helper, and a "use server" directive would expose every
// export as a POST endpoint.

const multiplierSchema = z.coerce.number().positive().max(10);

// Stored raw as entered (0–1 each); scoreBacklog renormalizes over the
// components active for a session's context, so save-time normalization
// would silently drift the admin's numbers.
const pickWeightSchema = z.coerce.number().min(0).max(1);

const settingsSchema = z
	.object({
		groupName: z.string().trim().min(1, "Group name is required").max(50),
		voteBudget: z.coerce.number().int().min(1).max(100),
		voteMaxPerGame: z.coerce.number().int().min(1).max(100),
		multiplier1: multiplierSchema,
		multiplier2: multiplierSchema,
		multiplier3: multiplierSchema,
		multiplier4: multiplierSchema,
		multiplier5: multiplierSchema,
		qualityWeight: z.coerce.number().min(0).max(1),
		voteMilestones: z.string().trim().max(200),
		pickInterest: pickWeightSchema,
		pickQuality: pickWeightSchema,
		pickTimeFit: pickWeightSchema,
		pickStaleness: pickWeightSchema,
		pickPartyFit: pickWeightSchema,
	})
	.refine((value) => value.voteMaxPerGame <= value.voteBudget, {
		message: "Max per game can't exceed the vote budget.",
	})
	.refine(
		(value) =>
			value.pickInterest +
				value.pickQuality +
				value.pickTimeFit +
				value.pickStaleness +
				value.pickPartyFit >
			0,
		{ message: "At least one picker weight must be non-zero." }
	);

/** "5, 10 15" → [5, 10, 15]; empty input disables milestones. */
function parseMilestones(input: string): number[] {
	if (!input) return [];
	const values = input.split(/[,\s]+/).filter(Boolean).map(Number);
	if (values.some((value) => !Number.isInteger(value) || value <= 0)) {
		throw new Error("Milestones must be positive whole numbers.");
	}
	return [...new Set(values)].sort((a, b) => a - b);
}

export async function updateAppSettings(formData: FormData): Promise<void> {
	await requireAdmin();
	const input = settingsSchema.parse({
		groupName: formData.get("groupName"),
		voteBudget: formData.get("voteBudget"),
		voteMaxPerGame: formData.get("voteMaxPerGame"),
		multiplier1: formData.get("multiplier1"),
		multiplier2: formData.get("multiplier2"),
		multiplier3: formData.get("multiplier3"),
		multiplier4: formData.get("multiplier4"),
		multiplier5: formData.get("multiplier5"),
		qualityWeight: formData.get("qualityWeight"),
		voteMilestones: formData.get("voteMilestones") ?? "",
		pickInterest: formData.get("pickInterest"),
		pickQuality: formData.get("pickQuality"),
		pickTimeFit: formData.get("pickTimeFit"),
		pickStaleness: formData.get("pickStaleness"),
		pickPartyFit: formData.get("pickPartyFit"),
	});

	const difficultyMultipliers: DifficultyMultipliers = {
		1: input.multiplier1,
		2: input.multiplier2,
		3: input.multiplier3,
		4: input.multiplier4,
		5: input.multiplier5,
	};
	const pickWeights: PickWeights = {
		interest: input.pickInterest,
		quality: input.pickQuality,
		timeFit: input.pickTimeFit,
		staleness: input.pickStaleness,
		partyFit: input.pickPartyFit,
	};
	const values = {
		// Unchecked checkboxes are absent from FormData — no zod field needed.
		showCompletionStats: formData.get("showCompletionStats") === "1",
		groupName: input.groupName,
		voteBudget: input.voteBudget,
		voteMaxPerGame: input.voteMaxPerGame,
		difficultyMultipliers,
		qualityWeight: input.qualityWeight,
		voteMilestones: parseMilestones(input.voteMilestones),
		pickWeights,
		updatedAt: new Date(),
	};

	// First write path for the lazily-created single row (id = 1).
	const db = getDb();
	await db
		.insert(schema.appSettings)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: schema.appSettings.id, set: values });

	revalidatePath("/admin");
	revalidatePath("/pick");
	revalidatePath("/", "layout");
}
