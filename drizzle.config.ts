import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs under Node (not Workers), so it reads DATABASE_URL from
// .env — not .dev.vars. Keep both files in sync.
export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db/schema",
	out: "./drizzle",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
});
