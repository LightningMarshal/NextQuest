import { getDb, schema } from "@/db";
import { DEFAULT_PICK_WEIGHTS, type PickWeights } from "@/lib/pick";
import {
	DEFAULT_DIFFICULTY_MULTIPLIERS,
	DEFAULT_QUALITY_WEIGHT,
	type DifficultyMultipliers,
} from "@/lib/points";

export type AppSettings = {
	groupName: string;
	voteBudget: number;
	voteMaxPerGame: number;
	difficultyMultipliers: DifficultyMultipliers;
	qualityWeight: number;
	voteMilestones: number[];
	pickWeights: PickWeights;
	/** Off = hide completion %/burn rate on the dashboard (issue #35). */
	showCompletionStats: boolean;
};

const DEFAULTS: AppSettings = {
	groupName: "NextQuest",
	voteBudget: 10,
	voteMaxPerGame: 4,
	difficultyMultipliers: DEFAULT_DIFFICULTY_MULTIPLIERS,
	qualityWeight: DEFAULT_QUALITY_WEIGHT,
	voteMilestones: [5, 10, 15],
	pickWeights: DEFAULT_PICK_WEIGHTS,
	showCompletionStats: true,
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
		qualityWeight: row.qualityWeight,
		voteMilestones: row.voteMilestones,
		// Rows written before the pick_weights migration may predate the column
		// default reaching this deployment.
		pickWeights: row.pickWeights ?? DEFAULT_PICK_WEIGHTS,
		showCompletionStats: row.showCompletionStats ?? true,
	};
}
