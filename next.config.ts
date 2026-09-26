import type { NextConfig } from "next";

import { OPTIMIZED_IMAGE_HOSTS } from "./src/lib/images";

const nextConfig: NextConfig = {
	images: {
		// Only provider art CDNs are optimized. The optimizer endpoint is public,
		// so a "**" wildcard made it an open image proxy billed to this account;
		// member-pasted URLs on other hosts render unoptimized via <GameArt>.
		remotePatterns: OPTIMIZED_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
