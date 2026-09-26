// Inline fonts, scripts and narration into one self-contained HTML file.
// Usage: node build.mjs  ->  dist/nextquest-promo.html
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
	`<style>\n${font("Shantell Sans", "assets/ShantellSans.woff2", "300 800")}\n${font("Caveat", "assets/Caveat.woff2", "400 700")}\n</style>\n<style>`,
);

const scripts = ["engine", "draw", "scenes", "audio", "main"].map((n) => read(`src/${n}.js`).toString());
const narration = read("assets/narration.mp3").toString("base64");
html = html.replace(
	/<!--SCRIPTS-->[\s\S]*?<!--\/SCRIPTS-->/,
	() => `<script>window.NARRATION_B64 = "${narration}";</script>\n<script>\n${scripts.join("\n")}\n</script>`,
);

fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
fs.writeFileSync(path.join(dir, "dist/nextquest-promo.html"), html);
console.log(`dist/nextquest-promo.html  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
