// Cron task (weekly, via the secret-gated /api/cron route; also "Back up
// now" on /admin): write the full export snapshot to the BACKUPS R2 bucket
// and prune snapshots past the retention window.
//
// Optional by design: with no BACKUPS binding (the default — see
// wrangler.jsonc and docs/deployment/14-backups-and-logs.md) it's a no-op,
// like Discord without a webhook. Neon's point-in-time restore is the
// other layer; this one survives losing the Neon project itself and is a
// plain JSON file anyone can open.

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { backupKey, backupsToPrune, BACKUP_PREFIX, parseRetentionDays } from "@/lib/backup";
import { buildSnapshot } from "@/server/export-read";

type BackupEnv = { BACKUPS?: R2Bucket; BACKUP_RETENTION_DAYS?: string };

function backupEnv(): BackupEnv {
	return getCloudflareContext().env as BackupEnv;
}

export function backupsConfigured(): boolean {
	return Boolean(backupEnv().BACKUPS);
}

export type StoredBackup = { key: string; uploaded: Date; size: number };

/** Newest first. Empty when backups aren't configured. */
export async function listBackups(): Promise<StoredBackup[]> {
	const bucket = backupEnv().BACKUPS;
	if (!bucket) return [];
	const objects: StoredBackup[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix: BACKUP_PREFIX, cursor });
		for (const object of page.objects) objects.push({ key: object.key, uploaded: object.uploaded, size: object.size });
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return objects.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
}

export async function runBackup(): Promise<{ written: number; bytes: number; pruned: number; skipped: number }> {
	const { BACKUPS: bucket, BACKUP_RETENTION_DAYS } = backupEnv();
	if (!bucket) return { written: 0, bytes: 0, pruned: 0, skipped: 1 };

	const now = new Date();
	const body = JSON.stringify(await buildSnapshot());
	await bucket.put(backupKey(now), body, {
		httpMetadata: { contentType: "application/json" },
		customMetadata: { app: "NextQuest", kind: "scheduled-export" },
	});

	// Prune only after the new snapshot is safely stored.
	const stale = backupsToPrune(await listBackups(), now, parseRetentionDays(BACKUP_RETENTION_DAYS));
	if (stale.length > 0) await bucket.delete(stale);
	return { written: 1, bytes: body.length, pruned: stale.length, skipped: 0 };
}
