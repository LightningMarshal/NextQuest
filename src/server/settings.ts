import { cache } from "react";

import { getDb, schema } from "@/db";

// The live, admin-tunable settings. (The retired vote/points/picker columns
// still exist in app_settings but nothing reads them — see schema/settings.ts.)
export type AppSettings = {
	groupName: string;
	/** Off = hide the legacy completion %/burn-rate on /stats (issue #35). */
	showCompletionStats: boolean;
};

const DEFAULTS: AppSettings = {
	groupName: "NextQuest",
	showCompletionStats: true,
};

// The single settings row is created lazily by the first admin edit
// (updateAppSettings in settings-actions.ts); until then everything runs on
// defaults. Memoized per request (React cache) — layout, page, and actions
// share one read.
export const getAppSettings = cache(async (): Promise<AppSettings> => {
	const db = getDb();
	const [row] = await db
		.select({
			groupName: schema.appSettings.groupName,
			showCompletionStats: schema.appSettings.showCompletionStats,
		})
		.from(schema.appSettings)
		.limit(1);
	return row ?? DEFAULTS;
});
