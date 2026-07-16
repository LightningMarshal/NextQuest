import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests target the pure-logic modules (src/lib) and provider parsers;
// no DB, no network — external fetches are stubbed per test.
export default defineConfig({
	resolve: {
		alias: { "@": path.resolve(__dirname, "src") },
	},
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
});
