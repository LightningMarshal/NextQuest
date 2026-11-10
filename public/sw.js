// NextQuest service worker (Phase 23). Deliberately tiny:
//
//   - it makes the app installable and gives a branded "you're offline"
//     page instead of the browser's dinosaur;
//   - it NEVER caches pages, API responses, or anything per-person. Every
//     page here is behind sign-in and differs by who's asking (guests see
//     fewer sessions than members) — a cached copy could show one person's
//     view to another on a shared device, or a stale roster as current.
//
// So: navigations always go to the network; only when the network fails do
// we answer, with the precached offline page. Bump VERSION to replace it.
const VERSION = "nq-offline-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/favicon.svg"];

// Cloudflare's static assets redirect /offline.html → /offline. A response
// that followed a redirect can't be used to answer a navigation (browsers
// reject it), so store a clean copy of the body under the original URL.
async function precache(cache, url) {
	const response = await fetch(url, { cache: "reload" });
	if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
	const clean = response.redirected
		? new Response(await response.blob(), { status: 200, headers: { "content-type": response.headers.get("content-type") ?? "text/html" } })
		: response;
	await cache.put(url, clean);
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(VERSION)
			.then((cache) => Promise.all(PRECACHE.map((url) => precache(cache, url))))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error())
		);
		return;
	}
	// The offline page's own assets, when offline. Everything else: untouched.
	const url = new URL(request.url);
	if (url.origin === self.location.origin && PRECACHE.includes(url.pathname)) {
		event.respondWith(fetch(request).catch(async () => (await caches.match(request)) ?? Response.error()));
	}
});
