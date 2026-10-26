import { describe, expect, it } from "vitest";

import { whenLabel } from "./when-label";

const now = new Date("2026-10-06T01:00:00Z"); // Mon Oct 5, 6:00 PM in Los Angeles
const tz = { timeZone: "America/Los_Angeles", locale: "en-US" };

describe("whenLabel", () => {
	it("says Today/Tomorrow in the viewer's zone, not UTC", () => {
		// 8pm PT Monday is already Tuesday in UTC.
		const tonight = whenLabel(new Date("2026-10-06T03:00:00Z"), now, tz);
		expect(tonight.day).toBe("Today");
		expect(tonight.time).toBe("8:00 PM");
		expect(tonight.relative).toBe("in 2h");
		expect(whenLabel(new Date("2026-10-07T03:00:00Z"), now, tz).day).toBe("Tomorrow");
	});
	it("uses the weekday within a week, a date beyond", () => {
		expect(whenLabel(new Date("2026-10-10T21:00:00Z"), now, tz).day).toBe("Saturday");
		expect(whenLabel(new Date("2026-10-20T03:00:00Z"), now, tz).day).toBe("Mon, Oct 19");
		expect(whenLabel(new Date("2027-01-10T03:00:00Z"), now, tz).day).toBe("Sat, Jan 9, 2027");
	});
	it("flags live sessions and near starts", () => {
		const live = whenLabel(new Date("2026-10-06T00:30:00Z"), now, {
			...tz,
			endsAt: new Date("2026-10-06T02:30:00Z"),
		});
		expect(live.live).toBe(true);
		expect(live.relative).toBe("live now");
		expect(whenLabel(new Date("2026-10-06T01:20:00Z"), now, tz).relative).toBe("in 20 min");
	});
});
