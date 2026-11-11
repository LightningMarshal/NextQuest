import { expect, test } from "@playwright/test";

// Installability (Phase 23): the manifest, its icons, and the offline
// fallback. The service worker only registers in production builds, so the
// offline test registers it by hand — the worker file is the same.

test("the manifest is public and every icon it names exists", async ({ request }) => {
	const response = await request.get("/manifest.webmanifest");
	expect(response.status()).toBe(200);
	const manifest = (await response.json()) as { display: string; start_url: string; icons: { src: string; purpose: string }[] };
	expect(manifest.display).toBe("standalone");
	expect(manifest.start_url).toBe("/");
	expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
	for (const icon of manifest.icons) {
		const image = await request.get(icon.src);
		expect(image.status(), icon.src).toBe(200);
		expect(image.headers()["content-type"]).toContain("image/png");
	}
});

test("pages link the manifest and an apple touch icon", async ({ page }) => {
	await page.goto("/sign-in");
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
	await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
	await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", /#/);
});

test("offline, a navigation gets the branded offline page — and recovers by itself", async ({ page, context }) => {
	await page.goto("/sign-in");
	await page.evaluate(async () => {
		await navigator.serviceWorker.register("/sw.js");
		await navigator.serviceWorker.ready;
	});
	await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

	await context.setOffline(true);
	await page.goto("/sessions");
	await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();

	await context.setOffline(false);
	await expect(page).toHaveURL(/\/sign-in\?next=%2Fsessions/);
});

test("the service worker never caches pages", async ({ page }) => {
	await page.goto("/sign-in");
	await page.evaluate(async () => {
		await navigator.serviceWorker.register("/sw.js");
		await navigator.serviceWorker.ready;
	});
	await page.goto("/sign-in");
	const cached = await page.evaluate(async () => {
		const urls: string[] = [];
		for (const name of await caches.keys()) {
			for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname);
		}
		return urls.sort();
	});
	expect(cached).toEqual(["/favicon.svg", "/icons/icon-192.png", "/offline.html"]);
});
