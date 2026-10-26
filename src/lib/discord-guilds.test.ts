import { describe, expect, it, vi } from "vitest";

import { isInAllowedGuild, parseGuildIds } from "./discord-guilds";

const respond = (body: unknown, status = 200) =>
	vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("parseGuildIds", () => {
	it("keeps snowflakes only", () => {
		expect(parseGuildIds(" 123456789012345678, abc ,987654321098765432,")).toEqual([
			"123456789012345678",
			"987654321098765432",
		]);
		expect(parseGuildIds(undefined)).toEqual([]);
	});
});

describe("isInAllowedGuild", () => {
	const allowed = ["111111111111111111", "222222222222222222"];

	it("admits a member of any allowed server", async () => {
		const fetchMock = respond([{ id: "999999999999999999" }, { id: "222222222222222222" }]);
		expect(await isInAllowedGuild("tok", allowed, fetchMock)).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://discord.com/api/users/@me/guilds",
			expect.objectContaining({ headers: { authorization: "Bearer tok" } })
		);
	});
	it("rejects non-members", async () => {
		expect(await isInAllowedGuild("tok", allowed, respond([{ id: "3" }]))).toBe(false);
	});
	it("fails closed on errors and odd payloads", async () => {
		expect(await isInAllowedGuild("tok", allowed, respond({ message: "401" }, 401))).toBe(false);
		expect(await isInAllowedGuild("tok", allowed, respond({ not: "an array" }))).toBe(false);
		const boom = vi.fn(async () => {
			throw new Error("network");
		}) as unknown as typeof fetch;
		expect(await isInAllowedGuild("tok", allowed, boom)).toBe(false);
	});
	it("never calls out without config", async () => {
		const fetchMock = respond([]);
		expect(await isInAllowedGuild("tok", [], fetchMock)).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
