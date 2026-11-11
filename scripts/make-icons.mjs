// Regenerates the PWA icons in public/icons/ from the two-chevron mark
// (the same geometry as public/favicon.svg). Run by hand when the mark
// changes — the PNGs are committed:
//
//   node scripts/make-icons.mjs
//
// Needs Playwright's Chromium (already a dev dependency for the E2E suite).
import fs from "node:fs";

import { chromium } from "@playwright/test";

const BG = "#0B0D11";

/** `pad` shrinks the mark toward the centre (maskable icons need a safe zone). */
function svg(size, { rounded, pad }) {
	const scale = 1 - pad * 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 58 58">
	<rect width="58" height="58" rx="${rounded ? 13 : 0}" fill="${BG}"/>
	<g transform="translate(${29 * (1 - scale)} ${29 * (1 - scale)}) scale(${scale})" fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
		<polyline points="14,16 26,29 14,42" stroke="#E7EBF1"/>
		<polyline points="28,16 40,29 28,42" stroke="#34D1E6"/>
	</g>
</svg>`;
}

const ICONS = [
	{ file: "icon-192.png", size: 192, rounded: true, pad: 0 },
	{ file: "icon-512.png", size: 512, rounded: true, pad: 0 },
	// Maskable: full-bleed background, mark inside the central 80% safe zone.
	{ file: "icon-maskable-512.png", size: 512, rounded: false, pad: 0.14 },
	// iOS rounds the corners itself and shows transparency as black.
	{ file: "apple-touch-icon.png", size: 180, rounded: false, pad: 0.06 },
];

const browser = await chromium.launch();
for (const icon of ICONS) {
	const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
	await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(icon.size, icon)}`);
	fs.writeFileSync(`public/icons/${icon.file}`, await page.screenshot({ omitBackground: true }));
	await page.close();
	console.log(`public/icons/${icon.file}`);
}
await browser.close();
