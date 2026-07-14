import { neon, neonConfig } from "@neondatabase/serverless";
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
	// Local-dev escape hatch: point the driver's HTTP transport at a local
	// Neon-protocol proxy (e.g. a shim over local Postgres) instead of
	// https://<host>/sql. Set only in .dev.vars; unset in production.
	const proxyEndpoint = (env as { NEON_HTTP_PROXY_ENDPOINT?: string }).NEON_HTTP_PROXY_ENDPOINT;
	if (proxyEndpoint) neonConfig.fetchEndpoint = proxyEndpoint;
	return drizzle(neon(databaseUrl), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
