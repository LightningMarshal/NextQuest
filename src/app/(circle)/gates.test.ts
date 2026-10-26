import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The (circle) layout deliberately doesn't redirect (it can't know the URL
// for the post-sign-in return path), so each page must gate itself. This
// test is the safety net: a new page without a gate fails CI.

function pages(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return pages(full);
		return name === "page.tsx" ? [full] : [];
	});
}

describe("(circle) pages", () => {
	const files = pages(path.join(__dirname));
	it("exist", () => {
		expect(files.length).toBeGreaterThan(0);
	});
	it.each(files.map((file) => [path.relative(__dirname, file), file]))("%s gates itself", (_, file) => {
		const source = readFileSync(file, "utf8");
		expect(source).toMatch(/await require(CircleUser|Member|Admin)\(/);
	});
});
