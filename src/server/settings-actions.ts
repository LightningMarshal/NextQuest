"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireAdmin } from "@/server/session";

// Kept separate from settings.ts on purpose: that module's getAppSettings()
// is an ungated read helper, and a "use server" directive would expose every
// export as a POST endpoint.

const settingsSchema = z.object({
	groupName: z.string().trim().min(1, "Group name is required").max(50),
});

export async function updateAppSettings(formData: FormData): Promise<void> {
	await requireAdmin();
	const parsed = settingsSchema.safeParse({ groupName: formData.get("groupName") });
	if (!parsed.success) throw new Error(parsed.error.issues[0].message);
	const values = {
		groupName: parsed.data.groupName,
		// Unchecked checkboxes are absent from FormData — no zod field needed.
		showCompletionStats: formData.get("showCompletionStats") === "1",
		updatedAt: new Date(),
	};

	// First write path for the lazily-created single row (id = 1).
	await getDb()
		.insert(schema.appSettings)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: schema.appSettings.id, set: values });

	revalidatePath("/", "layout");
}
