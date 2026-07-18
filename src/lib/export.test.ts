import { describe, expect, it } from "vitest";

import { escapeCsvValue, toCsv } from "./export";

describe("escapeCsvValue", () => {
	it("passes plain values through unquoted", () => {
		expect(escapeCsvValue("Hades")).toBe("Hades");
		expect(escapeCsvValue(42)).toBe("42");
		expect(escapeCsvValue(true)).toBe("true");
	});

	it("renders null and undefined as empty fields", () => {
		expect(escapeCsvValue(null)).toBe("");
		expect(escapeCsvValue(undefined)).toBe("");
	});

	it("quotes fields containing commas, quotes, or newlines", () => {
		expect(escapeCsvValue("Baldur's Gate 3, Act 2")).toBe('"Baldur\'s Gate 3, Act 2"');
		expect(escapeCsvValue('the "definitive" edition')).toBe('"the ""definitive"" edition"');
		expect(escapeCsvValue("line one\nline two")).toBe('"line one\nline two"');
	});

	it("serializes dates as ISO 8601", () => {
		expect(escapeCsvValue(new Date("2026-07-18T12:00:00Z"))).toBe("2026-07-18T12:00:00.000Z");
	});
});

describe("toCsv", () => {
	it("emits header + rows with CRLF line endings and a trailing newline", () => {
		const csv = toCsv(
			["title", "points"],
			[
				["Hades", 7],
				["Portal 2", 3],
			]
		);
		expect(csv).toBe("title,points\r\nHades,7\r\nPortal 2,3\r\n");
	});

	it("handles an empty row set (header only)", () => {
		expect(toCsv(["a", "b"], [])).toBe("a,b\r\n");
	});

	it("escapes cell values", () => {
		expect(toCsv(["note"], [['said "hi", left']])).toBe('note\r\n"said ""hi"", left"\r\n');
	});
});
