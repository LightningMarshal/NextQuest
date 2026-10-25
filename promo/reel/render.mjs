// Export the reel to MP4 by stepping the built page and screenshotting each frame.
// Needs: playwright (+ Chromium), ffmpeg with libx264.
// Usage: FFMPEG=ffmpeg CHROMIUM=/path/to/chrome [CRF=14] [ABR=320k] node render.mjs [out.mp4] [fps]
import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.join(dir, "dist/nextquest-reel.mp4");
const fps = Number(process.argv[3] ?? 60);
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("file://" + path.join(dir, "dist/nextquest-reel.html") + "?export");
await page.waitForFunction(() => window.REEL);
await page.evaluate(() => window.REEL.ready);
const duration = await page.evaluate(() => window.REEL.duration);
const wavPath = out.replace(/\.mp4$/, ".wav");
fs.writeFileSync(wavPath, Buffer.from(await page.evaluate(() => window.REEL.wavBase64()), "base64"));

const ff = spawn(ffmpeg, [
	"-y", "-loglevel", "error",
	"-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
	"-i", wavPath,
	"-c:v", "libx264", "-preset", "slow", "-crf", process.env.CRF ?? "14", "-pix_fmt", "yuv420p",
	"-c:a", "aac", "-b:a", process.env.ABR ?? "320k", "-ar", "48000",
	"-movflags", "+faststart", "-shortest", out,
], { stdio: ["pipe", "inherit", "inherit"] });

const frames = Math.round(duration * fps);
const clip = { x: 0, y: 0, width: 1920, height: 1080 };
for (let i = 0; i < frames; i++) {
	await page.evaluate((t) => window.REEL.frame(t), i / fps);
	const png = await page.screenshot({ clip, type: "png" });
	if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
	if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${frames}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
fs.unlinkSync(wavPath);
console.log(`\nwrote ${out}`);
