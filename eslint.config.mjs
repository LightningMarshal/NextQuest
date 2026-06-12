import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextCoreWebVitals,
	...nextTypescript,
	{
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
	globalIgnores([
		".open-next/**",
		".wrangler/**",
		"cloudflare-env.d.ts",
		"drizzle/**",
		// Imports .open-next build output that may not exist (see file header).
		"custom-worker.ts",
	]),
]);

export default eslintConfig;
