// Inline fonts and scripts into one self-contained HTML file.
// Usage: node build.mjs  ->  dist/nextquest-reel.html
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(dir, p));
let html = read("index.html").toString();
const font = (name, file, weights) =>
	`@font-face { font-family: '${name}'; src: url(data:font/woff2;base64,${read(file).toString("base64")}) format('woff2'); font-weight: ${weights}; font-display: block; }`;
html = html.replace(
	/<!--FONTS-->[\s\S]*?<!--\/FONTS-->/,
	`<style>\n${font("Unbounded", "assets/Unbounded.woff2", "400 900")}\n${font("Space Grotesk", "assets/SpaceGrotesk.woff2", "300 700")}\n${font("Hanken Grotesk", "assets/HankenGrotesk.woff2", "300 800")}\n${font("JetBrains Mono", "assets/JetBrainsMono.woff2", "400 700")}\n</style>`,
);
// the reel reuses the DSP toolkit from the hand-drawn film
const scripts = ["../shared/dsp.js", "src/reel.js", "src/reel-audio.js", "src/player.js"].map((p) => read(p).toString());
html = html.replace(/<!--SCRIPTS-->[\s\S]*?<!--\/SCRIPTS-->/, () => `<script>\n${scripts.join("\n")}\n</script>`);
fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
fs.writeFileSync(path.join(dir, "dist/nextquest-reel.html"), html);
console.log(`dist/nextquest-reel.html  ${(html.length / 1024).toFixed(0)} KB`);
