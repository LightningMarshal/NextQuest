"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb, schema } from "@/db";
import type { DifficultyMultipliers } from "@/lib/points";
import { requireAdmin } from "@/server/session";

// Kept separate from settings.ts on purpose: that module's getAppSettings()
// is an ungated read helper, and a "use server" directive would expose every
// export as a POST endpoint.

const multiplierSchema = z.coerce.number().positive().max(10);

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
	})
	.refine((value) => value.voteMaxPerGame <= value.voteBudget, {
		message: "Max per game can't exceed the vote budget.",
	});

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
	});

	const difficultyMultipliers: DifficultyMultipliers = {
		1: input.multiplier1,
		2: input.multiplier2,
		3: input.multiplier3,
		4: input.multiplier4,
		5: input.multiplier5,
	};
	const values = {
		groupName: input.groupName,
		voteBudget: input.voteBudget,
		voteMaxPerGame: input.voteMaxPerGame,
		difficultyMultipliers,
		qualityWeight: input.qualityWeight,
		voteMilestones: parseMilestones(input.voteMilestones),
		updatedAt: new Date(),
	};

	// First write path for the lazily-created single row (id = 1).
	const db = getDb();
	await db
		.insert(schema.appSettings)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: schema.appSettings.id, set: values });

	revalidatePath("/admin");
	revalidatePath("/vote");
	revalidatePath("/", "layout");
}
