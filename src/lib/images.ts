// Which image hosts go through Next's optimizer (Cloudflare Images binding).
// The optimizer endpoint (/_next/image) is public, so allowing "**" turned it
// into an open, billable image proxy for any URL on the internet. Provider
// art hosts are listed here AND in next.config.ts remotePatterns; anything
// else (a member-pasted cover URL) is rendered unoptimized, straight from
// its host.

export const OPTIMIZED_IMAGE_HOSTS = [
	"**.steamstatic.com",
	"**.akamaihd.net",
	"cf.geekdo-images.com",
	"media.rawg.io",
] as const;

function hostMatches(host: string, pattern: string): boolean {
	if (pattern.startsWith("**.")) {
		const suffix = pattern.slice(2); // ".steamstatic.com"
		return host.endsWith(suffix);
	}
	return host === pattern;
}

export function isOptimizableImage(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		return OPTIMIZED_IMAGE_HOSTS.some((pattern) => hostMatches(parsed.hostname, pattern));
	} catch {
		return false;
	}
}
