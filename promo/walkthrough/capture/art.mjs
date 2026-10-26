// Game art for the walkthrough. The promo seed points at real Steam art;
// `node capture/art.mjs` downloads every URL the database references into
// art-cache/ (by host and path), and the capture browser serves images from
// that cache: both direct requests and the app's /_next/image optimizer URLs,
// which the dev server would otherwise fetch itself. Needs network access to
// *.steamstatic.com once; after that captures run offline.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "./auth.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CACHE = path.resolve(here, "../art-cache");

export function cachePath(url) {
	try {
		const u = new URL(url);
		return path.join(CACHE, u.hostname, u.pathname);
	} catch {
		return null;
	}
}

export function cached(url) {
	const file = cachePath(url);
	return file && fs.existsSync(file) ? file : null;
}

/** Serve cached art to a Playwright context; returns how many art requests missed. */
export async function routeArt(ctx) {
	const misses = new Set();
	const serve = async (route, url) => {
		const file = cached(url);
		if (file) return route.fulfill({ path: file, contentType: "image/jpeg" });
		misses.add(url);
		return route.continue();
	};
	await ctx.route("**/_next/image?**", (route) => serve(route, new URL(route.request().url()).searchParams.get("url")));
	await ctx.route(/^https:\/\/[^/]*steamstatic\.com\//, (route) => serve(route, route.request().url()));
	return misses;
}

async function download() {
	const db = pool();
	const { rows } = await db.query("select header_url, cover_url from game_metadata");
	await db.end();
	const urls = [...new Set(rows.flatMap((r) => [r.header_url, r.cover_url]).filter(Boolean))];
	let ok = 0;
	for (const url of urls) {
		const file = cachePath(url);
		if (!file || fs.existsSync(file)) {
			ok += file ? 1 : 0;
			continue;
		}
		// curl rather than fetch: it honours HTTPS_PROXY and the system CA store.
		fs.mkdirSync(path.dirname(file), { recursive: true });
		try {
			execFileSync("curl", ["-fsSL", "--retry", "2", "-m", "30", "-o", file, url], { stdio: ["ignore", "ignore", "pipe"] });
			ok++;
		} catch (error) {
			fs.rmSync(file, { force: true });
			console.warn(`  ✗ ${url}: ${String(error.stderr).trim() || error.message}`);
		}
	}
	console.log(`art cache: ${ok}/${urls.length} images in ${path.relative(process.cwd(), CACHE)}`);
	if (ok < urls.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await download();
