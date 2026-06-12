import { getDb, schema } from "@/db";
import { DEFAULT_DIFFICULTY_MULTIPLIERS, type DifficultyMultipliers } from "@/lib/points";

export type AppSettings = {
	groupName: string;
	voteBudget: number;
	voteMaxPerGame: number;
	difficultyMultipliers: DifficultyMultipliers;
	voteMilestones: number[];
};

const DEFAULTS: AppSettings = {
	groupName: "stooge-log",
	voteBudget: 10,
	voteMaxPerGame: 4,
	difficultyMultipliers: DEFAULT_DIFFICULTY_MULTIPLIERS,
	voteMilestones: [5, 10, 15],
};

// The single settings row is created lazily by the first admin edit
// (updateAppSettings in settings-actions.ts); until then everything runs on
// defaults.
export async function getAppSettings(): Promise<AppSettings> {
	const db = getDb();
	const rows = await db.select().from(schema.appSettings).limit(1);
	const row = rows[0];
	if (!row) return DEFAULTS;
	return {
		groupName: row.groupName,
		voteBudget: row.voteBudget,
		voteMaxPerGame: row.voteMaxPerGame,
		difficultyMultipliers: row.difficultyMultipliers,
		voteMilestones: row.voteMilestones,
	};
}
