import { getCloudflareContext } from "@opennextjs/cloudflare";
import { XMLParser } from "fast-xml-parser";

import type { GameMetadataProvider, GameSearchResult, NormalizedGameMetadata } from "./types";

// BGG XML API2 — one API for both BoardGameGeek and RPGGeek (shared id
// space). Registration is required: requests carry a bearer token
// (BGG_API_TOKEN, from boardgamegeek.com/applications/create). Board games
// have real community weight/playtime/player-count data; RPG items only
// carry ratings and taxonomy — no length or complexity exists for them
// anywhere, by design of the site. Convention: ~1 req/s; the typeahead
// debounce and the cron's serial batch keep us under it.
//
// externalId format: "<type>:<id>", e.g. "boardgame:174430" /
// "rpgitem:283355" — the thing endpoint needs no type, but the proposer's
// pick must remember which kind it was.

const API = "https://boardgamegeek.com/xmlapi2";
const FETCH_TIMEOUT_MS = 8_000;
// The thing endpoint answers 202 while it builds a response — retry once.
const QUEUE_RETRY_DELAY_MS = 1_200;

function readToken(): string | undefined {
	// Request-scoped env (CLAUDE.md #6); the cast mirrors src/lib/discord.ts
	// for optional secrets that aren't in the generated env type.
	try {
		const { env } = getCloudflareContext();
		return (env as { BGG_API_TOKEN?: string }).BGG_API_TOKEN || undefined;
	} catch {
		return undefined;
	}
}

/** Mirrors rawgConfigured() — lets callers distinguish "no token set" from a
 * provider outage instead of lumping both into a generic search failure. */
export function bggConfigured(): boolean {
	return readToken() !== undefined;
}

function apiToken(): string {
	const token = readToken();
	if (!token) {
		throw new Error("BGG_API_TOKEN is not configured — BGG lookups are disabled.");
	}
	return token;
}

async function fetchXml(url: string): Promise<string> {
	const token = apiToken();
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (res.status === 202) {
			await new Promise((resolve) => setTimeout(resolve, QUEUE_RETRY_DELAY_MS));
			continue;
		}
		if (!res.ok) throw new Error(`BGG request failed: ${res.status} ${url}`);
		return res.text();
	}
	throw new Error(`BGG request still queued after retry: ${url}`);
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	processEntities: true,
});

/** BGG XML repeats elements without wrappers — normalize to an array. */
function asArray<T>(value: T | T[] | undefined): T[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

function attrNumber(node: unknown): number | undefined {
	const value = Number((node as { "@_value"?: string } | undefined)?.["@_value"]);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}

type ThingItem = {
	"@_type"?: string;
	"@_id"?: string;
	thumbnail?: string;
	image?: string;
	description?: string;
	name?: unknown;
	yearpublished?: unknown;
	minplayers?: unknown;
	maxplayers?: unknown;
	playingtime?: unknown;
	link?: unknown;
	statistics?: { ratings?: { average?: unknown; averageweight?: unknown } };
};

function primaryName(item: ThingItem): string | undefined {
	const names = asArray(item.name as { "@_type"?: string; "@_value"?: string } | unknown[]);
	const primary = (names as { "@_type"?: string; "@_value"?: string }[]).find(
		(name) => name["@_type"] === "primary"
	);
	return primary?.["@_value"] ?? (names[0] as { "@_value"?: string } | undefined)?.["@_value"];
}

function linkValues(item: ThingItem, type: string): string[] {
	return asArray(item.link as { "@_type"?: string; "@_value"?: string } | unknown[])
		.map((link) => link as { "@_type"?: string; "@_value"?: string })
		.filter((link) => link["@_type"] === type)
		.map((link) => link["@_value"])
		.filter((value): value is string => typeof value === "string");
}

export function parseBggExternalId(externalId: string): { type: "boardgame" | "rpgitem"; id: number } {
	const match = externalId.match(/^(boardgame|rpgitem):(\d+)$/);
	if (!match) throw new Error(`Unrecognized BGG external id: ${externalId}`);
	return { type: match[1] as "boardgame" | "rpgitem", id: Number(match[2]) };
}

export const bggProvider: GameMetadataProvider = {
	id: "bgg",

	async search(query: string): Promise<GameSearchResult[]> {
		const xml = await fetchXml(
			`${API}/search?query=${encodeURIComponent(query)}&type=boardgame,rpgitem`
		);
		const parsed = parser.parse(xml) as { items?: { item?: unknown } };
		return asArray(parsed.items?.item as ThingItem | ThingItem[])
			.map((item): GameSearchResult | null => {
				const id = item["@_id"];
				const type = item["@_type"];
				const title = primaryName(item);
				if (!id || !title || (type !== "boardgame" && type !== "rpgitem")) return null;
				return {
					providerId: "bgg",
					externalId: `${type}:${id}`,
					title,
					releaseYear: attrNumber(item.yearpublished),
					// Search responses carry no art; the preview fetch does.
				};
			})
			.filter((result): result is GameSearchResult => result !== null);
	},

	async fetchByExternalId(externalId: string): Promise<NormalizedGameMetadata> {
		const { type, id } = parseBggExternalId(externalId);
		const xml = await fetchXml(`${API}/thing?id=${id}&stats=1`);
		const parsed = parser.parse(xml) as { items?: { item?: unknown } };
		const [item] = asArray(parsed.items?.item as ThingItem | ThingItem[]);
		if (!item) throw new Error(`BGG thing ${id} returned no item.`);

		const ratings = item.statistics?.ratings;
		const average = attrNumber(ratings?.average);
		// Known BGG API bug: averageweight can be 0 even when the site shows a
		// value — attrNumber already treats 0 as missing.
		const weight = attrNumber(ratings?.averageweight);

		const metadata: NormalizedGameMetadata = {
			title: primaryName(item),
			bggId: id,
			coverUrl: item.image ?? item.thumbnail,
			description:
				typeof item.description === "string" && item.description.trim()
					? item.description.trim().slice(0, 1000)
					: undefined,
			bggRating: average !== undefined ? Math.round(average * 10) : undefined,
			raw: { bgg: item },
		};

		if (type === "boardgame") {
			metadata.genres = linkValues(item, "boardgamecategory").slice(0, 5);
			metadata.bggWeight = weight;
			metadata.playtimeMinutes = attrNumber(item.playingtime);
			metadata.minPlayers = attrNumber(item.minplayers);
			metadata.maxPlayers = attrNumber(item.maxplayers);
		} else {
			// RPG items: taxonomy only — weight/playtime/players don't exist.
			metadata.genres = linkValues(item, "rpggenre").slice(0, 5);
			metadata.system = linkValues(item, "rpg")[0] ?? linkValues(item, "rpgsystem")[0];
		}

		if (metadata.genres?.length === 0) metadata.genres = undefined;
		return metadata;
	},
};
