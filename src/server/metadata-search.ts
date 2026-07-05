"use server";

// Search-first proposing: typeahead candidates and a metadata preview for
// the propose form. Unlike the repo's form actions these return data — a
// server action is still the right shape (session-gated, no new API
// routes), it just isn't Promise<void>.

import { z } from "zod";

import {
	fetchGameMetadata,
	hltbProvider,
	steamProvider,
	type GameSearchResult,
	type NormalizedGameMetadata,
} from "@/lib/metadata";
import { requireApprovedUser } from "@/server/session";

const MAX_PER_PROVIDER = 8;

const querySchema = z.string().trim().min(2).max(100);

export type SearchCandidatesResult = {
	candidates: GameSearchResult[];
	/** Provider ids that errored — the UI offers retry / manual entry. */
	failures: string[];
};

export async function searchGameCandidates(rawQuery: string): Promise<SearchCandidatesResult> {
	await requireApprovedUser();
	const query = querySchema.parse(rawQuery);

	// Both providers in parallel; either failing just narrows the results
	// (same degradation contract as fetchGameMetadata).
	const [steam, hltb] = await Promise.allSettled([
		steamProvider.search(query),
		hltbProvider.search(query),
	]);

	const candidates: GameSearchResult[] = [];
	const failures: string[] = [];
	if (steam.status === "fulfilled") candidates.push(...steam.value.slice(0, MAX_PER_PROVIDER));
	else failures.push(steamProvider.id);
	if (hltb.status === "fulfilled") candidates.push(...hltb.value.slice(0, MAX_PER_PROVIDER));
	else failures.push(hltbProvider.id);

	return { candidates, failures };
}

const previewSchema = z.object({
	title: z.string().trim().min(1).max(200),
	steamAppId: z.number().int().positive().optional(),
	hltbId: z.string().trim().regex(/^\d+$/).max(20).optional(),
});

export type PreviewCandidateResult = {
	metadata: Omit<NormalizedGameMetadata, "raw">;
	sources: string[];
	failures: string[];
};

/**
 * Advisory full-metadata fetch for the preview panel. proposeGame refetches
 * from the ids authoritatively on submit, so skipping or racing the preview
 * is always safe.
 */
export async function previewCandidate(input: {
	title: string;
	steamAppId?: number;
	hltbId?: string;
}): Promise<PreviewCandidateResult> {
	await requireApprovedUser();
	const parsed = previewSchema.parse(input);
	const { metadata, sources, failures } = await fetchGameMetadata(parsed);
	// Never ship raw provider dumps to the client.
	const { raw: _raw, ...rest } = metadata;
	return { metadata: rest, sources, failures };
}
