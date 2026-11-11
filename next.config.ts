import type { NextConfig } from "next";

import { OPTIMIZED_IMAGE_HOSTS } from "./src/lib/images";

const nextConfig: NextConfig = {
	images: {
		// Only provider art CDNs are optimized. The optimizer endpoint is public,
		// so a "**" wildcard made it an open image proxy billed to this account;
		// member-pasted URLs on other hosts render unoptimized via <GameArt>.
		remotePatterns: OPTIMIZED_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
	},
	// Pre-redesign URLs (bookmarks, old Discord messages) → their new homes,
	// as real HTTP redirects rather than in-page ones.
	async redirects() {
		return [
			{
				source: "/events",
				has: [{ type: "query", key: "game", value: "(?<game>[0-9a-fA-F-]{36})" }],
				destination: "/sessions/new?game=:game",
				permanent: false,
			},
			{ source: "/events", destination: "/sessions", permanent: false },
			{ source: "/pick", destination: "/backlog", permanent: false },
			{ source: "/vote", destination: "/backlog", permanent: false },
			{ source: "/pending-approval", destination: "/apply", permanent: false },
		];
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
// Simulated bindings (the optional BACKUPS R2 bucket) persist to SQLite
// files that change constantly. Left at the default (.wrangler/state, inside
// the project) `next dev` sees those writes as source edits and reloads
// every page in a loop — so keep them where the dev watcher doesn't look.
initOpenNextCloudflareForDev({ persist: { path: "node_modules/.cache/wrangler-state" } });
