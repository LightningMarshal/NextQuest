import { describe, expect, it } from "vitest";

import { deleteBlocker, mergeBlocker } from "./game-hygiene";

const fresh = { id: "a", status: "proposed" as const, startedAt: null };
const played = { id: "b", status: "completed" as const, startedAt: new Date("2026-01-01") };

describe("deleteBlocker", () => {
	it("allows deleting proposals, rejections and never-played backlog games", () => {
		expect(deleteBlocker(fresh, 0)).toBeNull();
		expect(deleteBlocker({ status: "rejected", startedAt: null }, 0)).toBeNull();
		expect(deleteBlocker({ status: "backlog", startedAt: null }, 0)).toBeNull();
	});

	it("refuses anything the group played", () => {
		expect(deleteBlocker(played, 0)).toMatch(/played/);
		expect(deleteBlocker({ status: "playing", startedAt: new Date() }, 0)).toMatch(/played/);
		// Started once, then shelved: the history still matters.
		expect(deleteBlocker({ status: "abandoned", startedAt: new Date() }, 0)).toMatch(/played/);
		expect(deleteBlocker({ status: "backlog", startedAt: new Date() }, 0)).toMatch(/played/);
	});

	it("refuses a never-started game that still has played sessions", () => {
		expect(deleteBlocker(fresh, 1)).toMatch(/1 played session is/);
		expect(deleteBlocker(fresh, 3)).toMatch(/3 played sessions are/);
	});
});

describe("mergeBlocker", () => {
	it("lets a duplicate fold into the real entry", () => {
		expect(mergeBlocker(fresh, played)).toBeNull();
		expect(mergeBlocker(fresh, { ...fresh, id: "c" })).toBeNull();
		expect(mergeBlocker(played, { ...played, id: "c" })).toBeNull();
	});

	it("refuses to merge the played entry into an unplayed one", () => {
		expect(mergeBlocker(played, fresh)).toMatch(/merge it into this one/);
	});

	it("refuses merging a game into itself", () => {
		expect(mergeBlocker(fresh, fresh)).toMatch(/different game/);
	});
});
