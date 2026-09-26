import { describe, expect, it } from "vitest";

import { isUuid, randomToken, sha256Hex, timingSafeEqual } from "./ids";

describe("isUuid", () => {
	it("accepts uuids and rejects junk", () => {
		expect(isUuid("5eed0001-0000-4000-8000-000000000001")).toBe(true);
		expect(isUuid("not-a-uuid")).toBe(false);
		expect(isUuid("5eed0001-0000-4000-8000-000000000001x")).toBe(false);
		expect(isUuid(undefined)).toBe(false);
	});
});

describe("timingSafeEqual", () => {
	it("compares content", () => {
		expect(timingSafeEqual("abc", "abc")).toBe(true);
		expect(timingSafeEqual("abc", "abd")).toBe(false);
		expect(timingSafeEqual("abc", "abcd")).toBe(false);
		expect(timingSafeEqual("", "")).toBe(true);
	});
});

describe("tokens", () => {
	it("are url-safe and unique", () => {
		const a = randomToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(randomToken()).not.toBe(a);
	});
	it("hash deterministically", async () => {
		expect(await sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});
});
