import { describe, expect, it } from "vitest";

import { backupKey, backupsToPrune, parseRetentionDays } from "./backup";

const now = new Date("2026-11-10T05:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const weekly = (count: number) =>
	Array.from({ length: count }, (_, i) => ({ key: backupKey(daysAgo(i * 7)), uploaded: daysAgo(i * 7) }));

describe("backupKey", () => {
	it("is sortable and colon-free", () => {
		expect(backupKey(now)).toBe("backups/nextquest-2026-11-10T05-00-00Z.json");
	});
});

describe("backupsToPrune", () => {
	it("deletes only snapshots past the retention window", () => {
		// 20 weekly snapshots; 90 days keeps weeks 0–12.
		const pruned = backupsToPrune(weekly(20), now);
		expect(pruned).toHaveLength(7);
		expect(pruned).toContain(backupKey(daysAgo(13 * 7)));
		expect(pruned).not.toContain(backupKey(daysAgo(12 * 7)));
	});

	it("always keeps the newest four, however old", () => {
		const stale = [200, 300, 400, 500, 600].map((n) => ({ key: backupKey(daysAgo(n)), uploaded: daysAgo(n) }));
		expect(backupsToPrune(stale, now)).toEqual([backupKey(daysAgo(600))]);
	});

	it("never touches objects outside the backup prefix", () => {
		const objects = [...weekly(6), { key: "something-else.json", uploaded: daysAgo(900) }];
		expect(backupsToPrune(objects, now, 7)).not.toContain("something-else.json");
	});

	it("honours a custom window", () => {
		expect(backupsToPrune(weekly(10), now, 30)).toHaveLength(5); // weeks 5–9
	});
});

describe("parseRetentionDays", () => {
	it("falls back to 90 on junk or out-of-range values", () => {
		expect(parseRetentionDays(undefined)).toBe(90);
		expect(parseRetentionDays("soon")).toBe(90);
		expect(parseRetentionDays("1")).toBe(90);
		expect(parseRetentionDays("365")).toBe(365);
	});
});
