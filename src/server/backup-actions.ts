"use server";

import { revalidatePath } from "next/cache";

import { backupsConfigured, runBackup } from "@/server/cron/backup";
import { requireAdmin } from "@/server/session";

/** "Back up now" on /admin — the same task the weekly cron runs. */
export async function backUpNow(): Promise<void> {
	await requireAdmin();
	if (!backupsConfigured()) throw new Error("Backups aren't set up yet — see docs/deployment/14-backups-and-logs.md.");
	await runBackup();
	revalidatePath("/admin");
}
