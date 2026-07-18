import { afterEach, describe, expect, it, vi } from "vitest";

// bgg.ts reads BGG_API_TOKEN from the Cloudflare request context; tests run
// outside one, so stub the module with a configured token.
vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: () => ({ env: { BGG_API_TOKEN: "test-token" } }),
}));

import { bggConfigured, bggProvider, parseBggExternalId } from "./bgg";

const BOARDGAME_XML = `<?xml version="1.0" encoding="utf-8"?>
<items>
	<item type="boardgame" id="266192">
		<thumbnail>https://cf.example/thumb.jpg</thumbnail>
		<image>https://cf.example/full.jpg</image>
		<name type="primary" sortindex="1" value="Wingspan" />
		<name type="alternate" sortindex="1" value="Flügelschlag" />
		<description>A competitive bird-collection engine-building game.</description>
		<yearpublished value="2019" />
		<minplayers value="1" />
		<maxplayers value="5" />
		<playingtime value="70" />
		<link type="boardgamecategory" id="1089" value="Animals" />
		<link type="boardgamecategory" id="1002" value="Card Game" />
		<statistics page="1">
			<ratings>
				<average value="7.9" />
				<averageweight value="2.45" />
			</ratings>
		</statistics>
	</item>
</items>`;

const RPGITEM_XML = `<?xml version="1.0" encoding="utf-8"?>
<items>
	<item type="rpgitem" id="283355">
		<image>https://cf.example/dg.jpg</image>
		<name type="primary" sortindex="1" value="Delta Green: Agent's Handbook" />
		<description>Modern cosmic-horror roleplaying.</description>
		<link type="rpggenre" id="1" value="Horror" />
		<link type="rpg" id="2" value="Delta Green" />
		<statistics page="1">
			<ratings>
				<average value="8.4" />
				<averageweight value="0" />
			</ratings>
		</statistics>
	</item>
</items>`;

const SEARCH_XML = `<?xml version="1.0" encoding="utf-8"?>
<items total="2">
	<item type="boardgame" id="266192"><name type="primary" value="Wingspan" /><yearpublished value="2019" /></item>
	<item type="rpgitem" id="283355"><name type="primary" value="Delta Green" /></item>
</items>`;

function stubBgg(xmlByPath: Record<string, string>) {
	const seenHeaders: Record<string, string>[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			seenHeaders.push(init?.headers as Record<string, string>);
			const path = new URL(String(input)).pathname;
			const xml = Object.entries(xmlByPath).find(([key]) => path.endsWith(key))?.[1];
			if (!xml) return new Response("nope", { status: 404 });
			return new Response(xml, { headers: { "content-type": "application/xml" } });
		})
	);
	return seenHeaders;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("parseBggExternalId / bggConfigured", () => {
	it("splits the <type>:<id> external id and rejects other shapes", () => {
		expect(parseBggExternalId("boardgame:266192")).toEqual({ type: "boardgame", id: 266192 });
		expect(parseBggExternalId("rpgitem:283355")).toEqual({ type: "rpgitem", id: 283355 });
		expect(() => parseBggExternalId("steam:42")).toThrow(/Unrecognized/);
	});

	it("reports configured when the token is present (mocked context)", () => {
		expect(bggConfigured()).toBe(true);
	});
});

describe("bggProvider.search", () => {
	it("maps board games and RPG items, carrying the type in the external id", async () => {
		const headers = stubBgg({ "/search": SEARCH_XML });
		const results = await bggProvider.search("wingspan");
		expect(results).toEqual([
			{
				providerId: "bgg",
				externalId: "boardgame:266192",
				title: "Wingspan",
				releaseYear: 2019,
			},
			{ providerId: "bgg", externalId: "rpgitem:283355", title: "Delta Green", releaseYear: undefined },
		]);
		expect(headers[0].Authorization).toBe("Bearer test-token");
	});
});

describe("bggProvider.fetchByExternalId", () => {
	it("parses a board game: players, playtime, weight, rating rescaled to 0–100", async () => {
		stubBgg({ "/thing": BOARDGAME_XML });
		const metadata = await bggProvider.fetchByExternalId("boardgame:266192");
		expect(metadata.title).toBe("Wingspan"); // primary name, not the alternate
		expect(metadata.coverUrl).toBe("https://cf.example/full.jpg");
		expect(metadata.minPlayers).toBe(1);
		expect(metadata.maxPlayers).toBe(5);
		expect(metadata.playtimeMinutes).toBe(70);
		expect(metadata.bggWeight).toBeCloseTo(2.45);
		expect(metadata.bggRating).toBe(79); // 7.9 → 0–100
		expect(metadata.genres).toEqual(["Animals", "Card Game"]);
	});

	it("parses an RPG item: system + taxonomy, and the averageweight-0 API bug stays unset", async () => {
		stubBgg({ "/thing": RPGITEM_XML });
		const metadata = await bggProvider.fetchByExternalId("rpgitem:283355");
		expect(metadata.system).toBe("Delta Green");
		expect(metadata.genres).toEqual(["Horror"]);
		expect(metadata.bggRating).toBe(84);
		expect(metadata.bggWeight).toBeUndefined(); // 0 means "missing" on BGG
		expect(metadata.playtimeMinutes).toBeUndefined();
	});

	it("throws when the thing endpoint returns no item", async () => {
		stubBgg({ "/thing": `<?xml version="1.0"?><items></items>` });
		await expect(bggProvider.fetchByExternalId("boardgame:1")).rejects.toThrow(/no item/);
	});
});
