// Export the animation to MP4 by stepping the built page frame-by-frame.
// Needs: playwright (+ a Chromium), ffmpeg with libx264.
// Usage: FFMPEG=/path/to/ffmpeg CHROMIUM=/path/to/chrome node render.mjs [out.mp4] [fps]
import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.join(dir, "dist/nextquest-promo.mp4");
const fps = Number(process.argv[3] ?? 30);
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM || undefined,
	args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("file://" + path.join(dir, "dist/nextquest-promo.html"));
await page.waitForFunction(() => window.NQ);
await page.evaluate(() => window.NQ.ready);
const duration = await page.evaluate(() => window.NQ.duration);

const wavPath = out.replace(/\.mp4$/, ".wav");
fs.writeFileSync(wavPath, Buffer.from(await page.evaluate(() => window.NQ.wavBase64()), "base64"));

const ff = spawn(ffmpeg, [
	"-y", "-loglevel", "error",
	"-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
	"-i", wavPath,
	"-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-tune", "animation",
	"-c:a", "aac", "-b:a", "256k",
	"-movflags", "+faststart", "-shortest", out,
], { stdio: ["pipe", "inherit", "inherit"] });

const frames = Math.round(duration * fps);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
	const url = await page.evaluate((t) => window.NQ.frame(t), i / fps);
	const png = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
	if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
	if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log(`\nwrote ${out}`);
