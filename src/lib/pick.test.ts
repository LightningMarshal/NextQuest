import { describe, expect, it } from "vitest";

import {
	DEFAULT_PICK_WEIGHTS,
	explainPick,
	interestComponent,
	partyFitComponent,
	qualityComponent,
	scoreBacklog,
	stalenessComponent,
	timeFitComponent,
	type PickComponent,
	type PickComponentKey,
	type PickExplanationInput,
	type PickableGame,
	type SessionContext,
} from "./pick";

const NOW = new Date("2026-07-16T12:00:00Z");

function game(overrides: Partial<PickableGame> = {}): PickableGame {
	return {
		gameId: "g1",
		gameType: "video",
		lengthHours: 20,
		signals: {},
		tally: 0,
		backlogSince: null,
		gameModes: null,
		playerRange: null,
		...overrides,
	};
}

const anyNight: SessionContext = { commitment: "any", together: false, kind: "any" };

describe("interestComponent", () => {
	it("is the share of the strongest tally, 0 when nobody voted", () => {
		expect(interestComponent(5, 10)).toBe(0.5);
		expect(interestComponent(10, 10)).toBe(1);
		expect(interestComponent(0, 10)).toBe(0);
		expect(interestComponent(0, 0)).toBe(0);
	});
});

describe("qualityComponent", () => {
	it("maps 40→0, 100→1, and unknown to the neutral 0.5", () => {
		expect(qualityComponent(40)).toBe(0);
		expect(qualityComponent(100)).toBe(1);
		expect(qualityComponent(70)).toBeCloseTo(0.5);
		expect(qualityComponent(null)).toBe(0.5);
		expect(qualityComponent(10)).toBe(0); // clamped
	});
});

describe("timeFitComponent", () => {
	it("scores 1 inside the commitment range and decays outside it", () => {
		expect(timeFitComponent(15, { commitment: "weeknight" })).toBe(1); // 8–25h
		expect(timeFitComponent(15, { commitment: "any" })).toBe(1);
		const slightlyLong = timeFitComponent(30, { commitment: "weeknight" });
		const wayTooLong = timeFitComponent(100, { commitment: "snack" });
		expect(slightlyLong).toBeLessThan(1);
		expect(slightlyLong).toBeGreaterThan(0.5);
		expect(wayTooLong).toBeLessThan(0.1);
	});

	it("unscored games are neutral, never buried", () => {
		expect(timeFitComponent(null, { commitment: "epic" })).toBe(0.5);
	});

	it("boosts anything finishable in tonight's session", () => {
		// 4h game on a 4h night is a strong fit even for an "epic" commitment.
		expect(timeFitComponent(4, { commitment: "epic", sessionHours: 4 })).toBeGreaterThanOrEqual(
			0.95
		);
	});
});

describe("stalenessComponent", () => {
	it("ramps 0→1 over 120 days and treats unknown/fresh as 0", () => {
		expect(stalenessComponent(null, NOW)).toBe(0);
		expect(stalenessComponent(NOW, NOW)).toBe(0);
		const sixtyDaysAgo = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
		expect(stalenessComponent(sixtyDaysAgo, NOW)).toBeCloseTo(0.5);
		const yearAgo = new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000);
		expect(stalenessComponent(yearAgo, NOW)).toBe(1);
	});
});

describe("partyFitComponent", () => {
	it("video: group modes fit, single-player-only is a poor pick, unknown is neutral", () => {
		expect(partyFitComponent(game({ gameModes: ["co-op"] }), 3)).toBe(1);
		expect(partyFitComponent(game({ gameModes: ["single-player"] }), 3)).toBe(0.1);
		expect(partyFitComponent(game({ gameModes: null }), 3)).toBe(0.5);
		expect(partyFitComponent(game({ gameModes: [] }), 3)).toBe(0.5);
	});

	it("tabletop: real player ranges get sharper penalties", () => {
		const boardgame = (min: number | null, max: number | null) =>
			game({ gameType: "boardgame", playerRange: { min, max } });
		expect(partyFitComponent(boardgame(2, 4), 3)).toBe(1);
		expect(partyFitComponent(boardgame(4, 6), 2)).toBe(0.05); // can't even start
		expect(partyFitComponent(boardgame(2, 4), 6)).toBe(0.3); // someone sits out
		expect(partyFitComponent(boardgame(null, null), 4)).toBe(0.5);
		expect(partyFitComponent(game({ gameType: "ttrpg", playerRange: null }), 4)).toBe(0.5);
	});
});

describe("scoreBacklog", () => {
	it("ranks by the weighted composite and scales to 0–100", () => {
		const games = [
			game({ gameId: "loved", tally: 10, signals: { steamReviewScore: 95 } }),
			game({ gameId: "ignored", tally: 0, signals: { steamReviewScore: 50 } }),
		];
		const ranked = scoreBacklog(games, anyNight, DEFAULT_PICK_WEIGHTS, NOW);
		expect(ranked[0].gameId).toBe("loved");
		expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
		for (const entry of ranked) {
			expect(entry.score).toBeGreaterThanOrEqual(0);
			expect(entry.score).toBeLessThanOrEqual(100);
		}
	});

	it("partyFit only joins the mix when playing together with 2+ players", () => {
		const solo = scoreBacklog([game()], anyNight, DEFAULT_PICK_WEIGHTS, NOW);
		expect(solo[0].components.map((c) => c.key)).not.toContain("partyFit");
		const together = scoreBacklog(
			[game()],
			{ ...anyNight, together: true, players: 3 },
			DEFAULT_PICK_WEIGHTS,
			NOW
		);
		expect(together[0].components.map((c) => c.key)).toContain("partyFit");
	});

	it("active component weights are renormalized to sum to 1", () => {
		const ranked = scoreBacklog([game()], anyNight, DEFAULT_PICK_WEIGHTS, NOW);
		const total = ranked[0].components.reduce((sum, c) => sum + c.weight, 0);
		expect(total).toBeCloseTo(1);
	});

	it("all-zero weights degrade to an even split instead of NaN", () => {
		const ranked = scoreBacklog(
			[game()],
			anyNight,
			{ interest: 0, quality: 0, timeFit: 0, staleness: 0, partyFit: 0 },
			NOW
		);
		expect(Number.isFinite(ranked[0].score)).toBe(true);
		expect(ranked[0].components.every((c) => c.weight === 0.25)).toBe(true);
	});
});

describe("explainPick", () => {
	function component(key: PickComponentKey, value: number, weight = 0.25): PickComponent {
		return { key, value, weight };
	}
	function input(
		components: PickComponent[],
		overrides: Partial<PickExplanationInput> = {}
	): PickExplanationInput {
		return {
			components,
			tally: 5,
			backlogSince: null,
			gameType: "video",
			hasSessionHours: false,
			...overrides,
		};
	}

	it("leads with the strongest weighted contributor", () => {
		const line = explainPick(
			input([
				component("interest", 1, 0.4),
				component("quality", 0.9, 0.2),
				component("timeFit", 0.5, 0.2),
				component("staleness", 0.1, 0.2),
			])
		);
		expect(line.startsWith("the group's votes put it here")).toBe(true);
		expect(line).toContain("acclaimed");
	});

	it("admits what drags a low-ranked game down", () => {
		const line = explainPick(
			input(
				[
					component("interest", 0, 0.35),
					component("quality", 0.9, 0.15),
					component("timeFit", 0.1, 0.25),
					component("staleness", 0, 0.15),
				],
				{ tally: 0 }
			)
		);
		expect(line).toContain("no votes yet");
		expect(line).toContain("the length doesn't fit the plan");
	});

	it("never phrases staleness or unknown signals as a drag", () => {
		// Fresh arrival (staleness 0) + unknown quality/partyFit (0.5 neutral).
		const line = explainPick(
			input([
				component("interest", 1, 0.4),
				component("quality", 0.5, 0.2),
				component("staleness", 0, 0.2),
				component("partyFit", 0.5, 0.2),
			])
		);
		expect(line).not.toContain("middling");
		expect(line).not.toContain("shelf");
		expect(line).not.toContain("player count");
	});

	it("counts waiting time in months from backlogSince", () => {
		const now = new Date("2026-07-16T12:00:00Z");
		const line = explainPick(
			input([component("staleness", 0.9, 0.5), component("interest", 0.4, 0.5)], {
				backlogSince: new Date("2026-02-01T00:00:00Z"),
			}),
			now
		);
		expect(line).toContain("waiting 5 months");
	});

	it("says finishable tonight only when session hours were given", () => {
		const components = [component("timeFit", 1, 0.6), component("interest", 0.2, 0.4)];
		expect(explainPick(input(components, { hasSessionHours: true }))).toContain(
			"finishable tonight"
		);
		expect(explainPick(input(components, { hasSessionHours: false }))).toContain(
			"the length fits the plan"
		);
	});

	it("always says something", () => {
		const line = explainPick(
			input([
				component("interest", 0.4),
				component("quality", 0.45),
				component("timeFit", 0.4),
				component("staleness", 0.3),
			])
		);
		expect(line).toBe("middle of the pack on every factor");
	});

	it("caps the line at three positive phrases plus drags", () => {
		const line = explainPick(
			input([
				component("interest", 1, 0.2),
				component("quality", 1, 0.2),
				component("timeFit", 1, 0.2),
				component("staleness", 1, 0.2),
				component("partyFit", 1, 0.2),
			])
		);
		expect(line.split(" · ")).toHaveLength(3);
	});
});
