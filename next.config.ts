import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		// Steam art CDNs cover the auto-fetched metadata; the catch-all allows
		// members to paste a replacement cover/header URL from any https host
		// (issue #14). Fine for a single-tenant, auth-gated group app.
		remotePatterns: [
			{ protocol: "https", hostname: "**.steamstatic.com" },
			{ protocol: "https", hostname: "**.akamaihd.net" },
			{ protocol: "https", hostname: "**" },
		],
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
