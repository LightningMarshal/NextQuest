import type { MetadataRoute } from "next";

// Web app manifest (Phase 23): makes NextQuest installable — "Add to Home
// Screen" gives it an icon and a standalone window, which is how a session
// app actually gets opened at the table. Static on purpose: this route is
// public (no gate, like /sign-in), so it must not read group settings.
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "NextQuest",
		short_name: "NextQuest",
		description: "See what the group is playing and hop in.",
		id: "/",
		start_url: "/",
		scope: "/",
		display: "standalone",
		orientation: "portrait",
		background_color: "#0B0D11",
		theme_color: "#0B0D11",
		categories: ["games", "social"],
		icons: [
			{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
			{ src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
		shortcuts: [
			{ name: "Post a session", url: "/sessions/new" },
			{ name: "Sessions", url: "/sessions" },
		],
	};
}
