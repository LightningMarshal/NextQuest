import { describe, expect, it } from "vitest";

import { isOptimizableImage } from "./images";

describe("isOptimizableImage", () => {
	it("allows provider art hosts", () => {
		expect(isOptimizableImage("https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg")).toBe(true);
		expect(isOptimizableImage("https://cf.geekdo-images.com/x.jpg")).toBe(true);
		expect(isOptimizableImage("https://media.rawg.io/media/games/x.jpg")).toBe(true);
	});
	it("rejects everything else", () => {
		expect(isOptimizableImage("https://evil.example/x.jpg")).toBe(false);
		expect(isOptimizableImage("https://steamstatic.com.evil.example/x.jpg")).toBe(false);
		expect(isOptimizableImage("http://cdn.cloudflare.steamstatic.com/x.jpg")).toBe(false);
		expect(isOptimizableImage("not a url")).toBe(false);
	});
});
