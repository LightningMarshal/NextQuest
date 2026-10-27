// Assemble build/walkthrough.html: fonts and scripts inlined, plus WALK_DATA
// (the capture manifest, narration clips and cached embed art). Screenshots
// stay in captures/ and are referenced relatively.
// Usage: FFMPEG=ffmpeg node build.mjs
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { cached } from "./capture/art.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(dir, p));
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

const manifest = JSON.parse(read("captures/manifest.json"));
const lines = JSON.parse(read("narration/lines.json"));
const narration = {};
const durs = {};
for (const { id } of lines) {
	const file = path.join(dir, "narration", `${id}.ogg`);
	narration[id] = `data:audio/ogg;base64,${fs.readFileSync(file).toString("base64")}`;
	// ffmpeg prints the duration on stderr and exits non-zero without an output
	let info = "";
	try {
		execFileSync(ffmpeg, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
	} catch (error) {
		info = String(error.stderr);
	}
	const m = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
	if (!m) throw new Error(`no duration for ${file}`);
	durs[id] = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
const art = {};
for (const d of manifest.discord) {
	const url = d.embed.thumbnail?.url;
	const file = url && cached(url);
	if (file) art[url] = `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
}
const data = { manifest, lines, durs, narration, art, captures: "../captures/", repoUrl: "github.com/LightningMarshal/NextQuest" };

let html = read("index.html").toString();
const font = (name, file, weights) =>
	`@font-face { font-family: '${name}'; src: url(data:font/woff2;base64,${read(file).toString("base64")}) format('woff2'); font-weight: ${weights}; font-display: block; }`;
html = html.replace(
	"<!--FONTS-->",
	`<style>\n${font("Unbounded", "../reel/assets/Unbounded.woff2", "400 900")}\n${font("Space Grotesk", "../reel/assets/SpaceGrotesk.woff2", "300 700")}\n${font("Hanken Grotesk", "../reel/assets/HankenGrotesk.woff2", "300 800")}\n${font("JetBrains Mono", "../reel/assets/JetBrainsMono.woff2", "400 700")}\n</style>`,
);
const scripts = ["../shared/dsp.js", "src/walk.js", "src/walk-audio.js", "src/player.js"].map((p) => read(p).toString());
html = html.replace("<!--SCRIPTS-->", () => `<script>window.WALK_DATA = ${JSON.stringify(data)};</script>\n<script>\n${scripts.join("\n")}\n</script>`);
fs.mkdirSync(path.join(dir, "build"), { recursive: true });
fs.writeFileSync(path.join(dir, "build/walkthrough.html"), html);
console.log(`build/walkthrough.html  ${(html.length / 1024).toFixed(0)} KB · ${Object.keys(art).length} embed images`);
