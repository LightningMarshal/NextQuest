// Game art for the walkthrough. The demo games are fictional (games.json), so
// their covers (600×900) and headers (460×215) are painted here: a motif per
// game in SVG plus the title, rendered by Chromium into art-cache/ (git-ignored;
// it rebuilds in seconds). The seed points every game at
// https://art.nextquest.example/<slug>/{cover,header}.png and the capture
// browser serves those URLs, and the app's /_next/image URLs, from the cache.
//
//   CHROMIUM=/path/to/chrome node promo/walkthrough/capture/art.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CACHE = path.resolve(here, "../art-cache");
const ART_HOST = "art.nextquest.example";

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

/** Serve cached art to a Playwright context; returns the URLs that missed. */
export async function routeArt(ctx) {
	const misses = new Set();
	const serve = async (route, url) => {
		const file = cached(url);
		if (file) return route.fulfill({ path: file, contentType: "image/png" });
		misses.add(url);
		return route.continue();
	};
	await ctx.route("**/_next/image?**", (route) => serve(route, new URL(route.request().url()).searchParams.get("url")));
	await ctx.route(new RegExp(`^https://${ART_HOST.replace(/\./g, "\\.")}/`), (route) => serve(route, route.request().url()));
	return misses;
}

// ---------------------------------------------------------------- painting
// (runs in the browser: plain functions serialised into the page)

function paint(game, w, h) {
	const [accent, base, motif] = game.art;
	let seed = game.n * 9301 + 49297;
	const rnd = () => ((seed = (seed * 233280 + 49297) % 2147483647) / 2147483647);
	const cx = w / 2;
	const cy = h * 0.42;
	const R = Math.min(w, h);
	const el = [];
	const star = (n, maxY = h) => {
		for (let i = 0; i < n; i++) el.push(`<circle cx="${rnd() * w}" cy="${rnd() * maxY}" r="${(rnd() * 1.6 + 0.3).toFixed(2)}" fill="#fff" opacity="${(rnd() * 0.7 + 0.2).toFixed(2)}"/>`);
	};
	const ridge = (y0, amp, color, op) => {
		let d = `M0 ${h} L0 ${y0}`;
		for (let x = 0; x <= w + 20; x += w / 9) d += ` L${x.toFixed(0)} ${(y0 - rnd() * amp).toFixed(0)}`;
		el.push(`<path d="${d} L${w} ${h} Z" fill="${color}" opacity="${op}"/>`);
	};
	switch (motif) {
		case "planet":
			star(160);
			el.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.33}" fill="url(#ball)"/>`);
			el.push(`<ellipse cx="${cx}" cy="${cy}" rx="${R * 0.56}" ry="${R * 0.1}" fill="none" stroke="${accent}" stroke-width="${R * 0.018}" opacity="0.8" transform="rotate(-14 ${cx} ${cy})"/>`);
			for (let i = 0; i < 7; i++) el.push(`<polygon points="${[0, 1, 2].map(() => `${(rnd() * w).toFixed(0)},${(h * 0.7 + rnd() * h * 0.3).toFixed(0)}`).join(" ")}" fill="${base}" stroke="${accent}" stroke-opacity="0.35"/>`);
			break;
		case "eye":
			ridge(h * 0.8, h * 0.12, "#000", 0.7);
			for (let i = 0; i < 18; i++) {
				const x = rnd() * w;
				const th = h * (0.25 + rnd() * 0.35);
				el.push(`<path d="M${x} ${h} L${x - 14} ${h} L${x - 3} ${h - th} Z" fill="#000" opacity="0.85"/>`);
			}
			el.push(`<path d="M${cx - R * 0.36} ${cy} Q${cx} ${cy - R * 0.3} ${cx + R * 0.36} ${cy} Q${cx} ${cy + R * 0.3} ${cx - R * 0.36} ${cy} Z" fill="none" stroke="${accent}" stroke-width="${R * 0.012}" filter="url(#glow)"/>`);
			el.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.09}" fill="${accent}" filter="url(#glow)"/><circle cx="${cx}" cy="${cy}" r="${R * 0.035}" fill="#000"/>`);
			break;
		case "tower":
			star(90, h * 0.6);
			el.push(`<circle cx="${cx + R * 0.18}" cy="${cy - R * 0.12}" r="${R * 0.16}" fill="${accent}" opacity="0.9" filter="url(#glow)"/>`);
			ridge(h * 0.82, h * 0.06, "#000", 0.9);
			el.push(`<path d="M${cx - R * 0.09} ${h} L${cx - R * 0.07} ${cy + R * 0.02} L${cx - R * 0.11} ${cy + R * 0.02} L${cx} ${cy - R * 0.2} L${cx + R * 0.11} ${cy + R * 0.02} L${cx + R * 0.07} ${cy + R * 0.02} L${cx + R * 0.09} ${h} Z" fill="#05030a"/>`);
			el.push(`<rect x="${cx - R * 0.012}" y="${cy + R * 0.08}" width="${R * 0.024}" height="${R * 0.04}" fill="${accent}"/>`);
			break;
		case "shards":
			for (let i = 0; i < 26; i++) {
				const x = rnd() * w;
				const y = h * 0.3 + rnd() * h * 0.7;
				const s = R * (0.05 + rnd() * 0.18);
				el.push(`<polygon points="${x},${y - s} ${x + s * 0.35},${y} ${x},${y + s * 0.5} ${x - s * 0.35},${y}" fill="${i % 3 ? base : accent}" stroke="${accent}" stroke-width="1.5" opacity="${(0.5 + rnd() * 0.5).toFixed(2)}" transform="rotate(${(rnd() * 50 - 25).toFixed(0)} ${x} ${y})"/>`);
			}
			el.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.12}" fill="${accent}" filter="url(#glow)" opacity="0.8"/>`);
			break;
		case "mountain":
			star(120, h * 0.5);
			el.push(`<circle cx="${cx - R * 0.15}" cy="${cy - R * 0.15}" r="${R * 0.1}" fill="#fff" opacity="0.85"/>`);
			ridge(h * 0.62, h * 0.22, accent, 0.25);
			ridge(h * 0.74, h * 0.2, accent, 0.4);
			ridge(h * 0.86, h * 0.16, "#000", 0.75);
			break;
		case "rings":
			for (let i = 9; i > 0; i--) el.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.06 * i}" fill="none" stroke="${accent}" stroke-width="${R * 0.008 * (10 - i) * 0.4}" opacity="${(0.15 + 0.08 * (10 - i)).toFixed(2)}"/>`);
			el.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.07}" fill="${accent}" filter="url(#glow)"/>`);
			break;
		case "waves":
			el.push(`<circle cx="${cx}" cy="${h * 0.32}" r="${R * 0.14}" fill="${accent}" opacity="0.85" filter="url(#glow)"/>`);
			for (let k = 0; k < 9; k++) {
				const y0 = h * (0.5 + k * 0.06);
				let d = `M0 ${y0}`;
				for (let x = 0; x <= w; x += 10) d += ` L${x} ${(y0 + Math.sin(x / (34 + k * 6) + k) * (6 + k * 2)).toFixed(1)}`;
				el.push(`<path d="${d} L${w} ${h} L0 ${h} Z" fill="${base}" stroke="${accent}" stroke-opacity="${(0.6 - k * 0.05).toFixed(2)}" stroke-width="2"/>`);
			}
			break;
		case "scan":
			for (let y = 0; y < h; y += 6) el.push(`<rect x="0" y="${y}" width="${w}" height="2" fill="#fff" opacity="${(0.02 + rnd() * 0.05).toFixed(3)}"/>`);
			el.push(`<ellipse cx="${cx}" cy="${cy}" rx="${R * 0.2}" ry="${R * 0.27}" fill="#fff" opacity="0.12" filter="url(#glow)"/>`);
			el.push(`<circle cx="${cx - R * 0.07}" cy="${cy - R * 0.03}" r="${R * 0.03}" fill="#000"/><circle cx="${cx + R * 0.07}" cy="${cy - R * 0.03}" r="${R * 0.03}" fill="#000"/><ellipse cx="${cx}" cy="${cy + R * 0.11}" rx="${R * 0.03}" ry="${R * 0.05}" fill="#000"/>`);
			for (let i = 0; i < 7; i++) el.push(`<rect x="${rnd() * w * 0.6}" y="${rnd() * h}" width="${w * (0.2 + rnd() * 0.5)}" height="${3 + rnd() * 10}" fill="${accent}" opacity="0.35"/>`);
			break;
		case "dots":
			for (let y = 0; y < h; y += 22)
				for (let x = (y / 22) % 2 ? 11 : 0; x < w; x += 22) {
					const d = Math.hypot(x - cx, y - cy) / R;
					const r = Math.max(0, 9 - d * 14);
					if (r > 0.4) el.push(`<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${accent}" opacity="${(0.25 + 0.75 * (1 - d)).toFixed(2)}"/>`);
				}
			break;
		case "sun": {
			el.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.3}" fill="url(#sun)"/>`);
			for (let i = 0; i < 7; i++) el.push(`<rect x="0" y="${cy + R * (0.02 + i * 0.04)}" width="${w}" height="${R * (0.008 + i * 0.004)}" fill="${base}"/>`);
			ridge(h * 0.8, h * 0.08, "#000", 0.85);
			break;
		}
		case "grid": {
			const hz = h * 0.55;
			el.push(`<rect x="0" y="${hz - 2}" width="${w}" height="4" fill="${accent}" filter="url(#glow)"/>`);
			for (let i = -12; i <= 12; i++) el.push(`<line x1="${cx + i * 10}" y1="${hz}" x2="${cx + i * w * 0.18}" y2="${h}" stroke="${accent}" stroke-opacity="0.5"/>`);
			for (let k = 1; k < 12; k++) {
				const y = hz + (h - hz) * Math.pow(k / 12, 2);
				el.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${accent}" stroke-opacity="${(0.15 + k * 0.04).toFixed(2)}"/>`);
			}
			star(70, hz);
			break;
		}
		case "hex": {
			const s = R * 0.07;
			for (let y = 0; y < h + s; y += s * 1.5)
				for (let x = 0; x < w + s; x += s * 1.732) {
					const ox = (Math.round(y / (s * 1.5)) % 2) * s * 0.866;
					const pts = [0, 1, 2, 3, 4, 5].map((k) => `${(x + ox + s * 0.92 * Math.cos((Math.PI / 3) * k + Math.PI / 6)).toFixed(1)},${(y + s * 0.92 * Math.sin((Math.PI / 3) * k + Math.PI / 6)).toFixed(1)}`).join(" ");
					const lit = rnd() < 0.12;
					el.push(`<polygon points="${pts}" fill="${lit ? accent : "none"}" fill-opacity="0.5" stroke="${accent}" stroke-opacity="${lit ? 0.9 : 0.18}"/>`);
				}
			break;
		}
		case "claw":
			for (let i = 0; i < 3; i++) {
				const x = cx - R * 0.16 + i * R * 0.16;
				el.push(`<path d="M${x - R * 0.12} ${cy - R * 0.3} Q${x + R * 0.04} ${cy} ${x + R * 0.1} ${cy + R * 0.32} Q${x - R * 0.02} ${cy} ${x - R * 0.12} ${cy - R * 0.3} Z" fill="${accent}" filter="url(#glow)"/>`);
			}
			ridge(h * 0.86, h * 0.08, "#000", 0.8);
			break;
		case "crown":
			star(60, h * 0.7);
			el.push(`<path d="M${cx - R * 0.26} ${cy + R * 0.14} L${cx - R * 0.3} ${cy - R * 0.14} L${cx - R * 0.13} ${cy} L${cx} ${cy - R * 0.22} L${cx + R * 0.13} ${cy} L${cx + R * 0.3} ${cy - R * 0.14} L${cx + R * 0.26} ${cy + R * 0.14} Z" fill="none" stroke="${accent}" stroke-width="${R * 0.016}" stroke-linejoin="round" filter="url(#glow)"/>`);
			for (let i = 0; i < 40; i++) el.push(`<circle cx="${cx + (rnd() - 0.5) * R * 0.8}" cy="${cy + R * 0.2 + rnd() * h * 0.4}" r="${(rnd() * 2 + 0.5).toFixed(1)}" fill="${accent}" opacity="${(rnd() * 0.6).toFixed(2)}"/>`);
			break;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="#030305"/></linearGradient>
<radialGradient id="halo" cx="0.5" cy="0.42" r="0.6"><stop offset="0" stop-color="${accent}" stop-opacity="0.45"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
<radialGradient id="ball" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${accent}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="#000"/></radialGradient>
<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></radialGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${R * 0.02}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${game.n}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.07 0"/></filter>
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/><rect width="${w}" height="${h}" fill="url(#halo)"/>
${el.join("")}
<rect width="${w}" height="${h}" fill="url(#vig)"/><rect width="${w}" height="${h}" filter="url(#grain)"/>
</svg>`;
}

const FONTS = [
	["Unbounded", 800, "none", "-0.02em"],
	["Space Grotesk", 700, "uppercase", "0.02em"],
	["JetBrains Mono", 700, "uppercase", "0.06em"],
];

function card(game, kind) {
	const cover = kind === "cover";
	const [w, h] = cover ? [600, 900] : [460, 215];
	const scene = paint(game, w, h);
	const [family, weight, transform, tracking] = FONTS[game.n % FONTS.length];
	const accent = game.art[0];
	const size = cover ? (game.title.length > 12 ? 74 : 92) : game.title.length > 12 ? 36 : 44;
	const words = game.title.split(" ");
	const title = cover ? words.join("<br>") : game.title;
	const kicker = game.genres.join(" · ");
	return `<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">${scene}
<div style="position:absolute;left:${cover ? 44 : 24}px;right:${cover ? 44 : 24}px;bottom:${cover ? 54 : 22}px;color:#fff">
<div style="font:600 ${cover ? 18 : 11}px/1 'JetBrains Mono';letter-spacing:.2em;text-transform:uppercase;color:${accent};margin-bottom:${cover ? 16 : 8}px">${kicker}</div>
<div class="t" style="font-family:'${family}';font-weight:${weight};font-size:${size}px;line-height:.95;letter-spacing:${tracking};text-transform:${transform};text-shadow:0 4px 30px rgba(0,0,0,.6)">${title}</div>
</div></div>`;
}

async function generate() {
	const { chromium } = await import("playwright");
	const games = JSON.parse(fs.readFileSync(path.resolve(here, "../games.json"), "utf8"));
	const fonts = path.resolve(here, "../../reel/assets");
	const face = (name, file, wt) => `@font-face{font-family:'${name}';src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fonts, file)).toString("base64")}) format('woff2');font-weight:${wt}}`;
	const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
	const page = await browser.newPage();
	for (const game of games) {
		for (const kind of ["cover", "header"]) {
			await page.setContent(`<style>${face("Unbounded", "Unbounded.woff2", "400 900")}${face("Space Grotesk", "SpaceGrotesk.woff2", "300 700")}${face("JetBrains Mono", "JetBrainsMono.woff2", "400 700")}body{margin:0;background:#000}</style>${card(game, kind)}`);
			await page.evaluate(async () => {
				await document.fonts.ready;
				// shrink long single words until the title fits its column
				const t = document.querySelector(".t");
				for (let px = parseFloat(t.style.fontSize); t.scrollWidth > t.clientWidth && px > 16; px -= 2) t.style.fontSize = `${px}px`;
			});
			const file = cachePath(`https://${ART_HOST}/${game.slug}/${kind}.png`);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			await page.locator("body > div").screenshot({ path: file });
		}
	}
	await browser.close();
	console.log(`art: ${games.length * 2} images in ${path.relative(process.cwd(), CACHE)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generate();
