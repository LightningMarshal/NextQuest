import { describe, expect, it } from "vitest";

import { safeNextPath, signInHref } from "./safe-redirect";

describe("safeNextPath", () => {
	it("keeps same-origin paths with queries", () => {
		expect(safeNextPath("/s/abc?x=1")).toBe("/s/abc?x=1");
	});
	it.each([
		["https://evil.com", "/"],
		["//evil.com/x", "/"],
		["/\\evil.com", "/"],
		["javascript:alert(1)", "/"],
		["relative/path", "/"],
		["/ok\nSet-Cookie: x", "/"],
		["", "/"],
		[null, "/"],
		[undefined, "/"],
	])("rejects %j", (input, expected) => {
		expect(safeNextPath(input as string | null | undefined)).toBe(expected);
	});
	it("uses the fallback", () => {
		expect(safeNextPath("//x", "/home")).toBe("/home");
	});
});

describe("signInHref", () => {
	it("encodes the return path", () => {
		expect(signInHref("/s/1?a=b")).toBe("/sign-in?next=%2Fs%2F1%3Fa%3Db");
	});
	it("drops a root next", () => {
		expect(signInHref("/")).toBe("/sign-in");
		expect(signInHref("//evil")).toBe("/sign-in");
	});
});
