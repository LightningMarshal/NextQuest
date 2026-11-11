// Pure rules for the scheduled R2 backups (src/server/cron/backup.ts):
// how a snapshot is named and which old ones may be deleted.

export const BACKUP_PREFIX = "backups/";
/** Snapshots older than this are pruned… */
export const DEFAULT_RETENTION_DAYS = 90;
/** …but never below this many, however old — a paused cron must not be
 * able to prune its way down to nothing. */
export const MIN_BACKUPS_KEPT = 4;

/** `backups/nextquest-2026-11-10T05-00-00Z.json` — sortable, no colons. */
export function backupKey(now: Date): string {
	const stamp = now.toISOString().slice(0, 19).replace(/:/g, "-");
	return `${BACKUP_PREFIX}nextquest-${stamp}Z.json`;
}

export function parseRetentionDays(value: string | undefined): number {
	const days = Number(value);
	return Number.isInteger(days) && days >= 7 && days <= 3650 ? days : DEFAULT_RETENTION_DAYS;
}

/**
 * Which stored snapshots to delete: older than the retention window AND
 * not among the newest MIN_BACKUPS_KEPT. Keys outside the backup prefix
 * are never touched.
 */
export function backupsToPrune(
	objects: { key: string; uploaded: Date }[],
	now: Date,
	retentionDays = DEFAULT_RETENTION_DAYS
): string[] {
	const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
	return objects
		.filter((object) => object.key.startsWith(BACKUP_PREFIX))
		.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
		.slice(MIN_BACKUPS_KEPT)
		.filter((object) => object.uploaded.getTime() < cutoff)
		.map((object) => object.key);
}
