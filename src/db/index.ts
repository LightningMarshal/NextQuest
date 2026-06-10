import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import * as schema from "./schema";

// Neon over HTTP: each query is a fetch, which fits the Workers request
// lifecycle (no TCP sockets, no pooler required). Build the client per
// request — env bindings are only available inside a request context.
export function getDb() {
	const { env } = getCloudflareContext();
	const databaseUrl = (env as { DATABASE_URL?: string }).DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set (configure .dev.vars locally or a Worker secret in prod)");
	}
	return drizzle(neon(databaseUrl), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
