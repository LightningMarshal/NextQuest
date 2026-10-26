// Export the walkthrough: step build/walkthrough.html frame by frame into
// ffmpeg (H.264 + AAC), and write the captions (.en.srt) and a 1280×720
// thumbnail (-thumbnail.jpg, the frame at THUMB_T seconds) next to it.
// Needs: playwright (+ Chromium), ffmpeg with libx264, and `node build.mjs` first.
// Usage: FFMPEG=ffmpeg CHROMIUM=/path/to/chrome [CRF=16] node render.mjs [out.mp4] [fps=30]
import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] ?? path.join(dir, "build/nextquest-walkthrough.mp4"));
const fps = Number(process.argv[3] ?? 30);
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("file://" + path.join(dir, "build/walkthrough.html") + "?export");
await page.waitForFunction(() => window.WALK);
await page.evaluate(() => window.WALK.ready);
const duration = await page.evaluate(() => window.WALK.duration);
const wavPath = out.replace(/\.mp4$/, ".wav");
fs.writeFileSync(wavPath, Buffer.from(await page.evaluate(() => window.WALK.wavBase64()), "base64"));

// captions: every narration line, at its cue
const lines = await page.evaluate(() => DATA.lines.map((l) => ({ text: l.caption ?? l.text, t0: CUES[l.id], t1: CUES[l.id] + DATA.durs[l.id] })));
const stamp = (s) => {
	const ms = Math.round(s * 1000);
	const p = (n, w = 2) => String(n).padStart(w, "0");
	return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
fs.writeFileSync(out.replace(/\.mp4$/, ".en.srt"), lines.map((l, i) => `${i + 1}\n${stamp(l.t0)} --> ${stamp(l.t1 + 0.2)}\n${l.text}\n`).join("\n"));

const ff = spawn(ffmpeg, [
	"-y", "-loglevel", "error",
	"-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
	"-i", wavPath,
	"-c:v", "libx264", "-preset", "slow", "-crf", process.env.CRF ?? "16", "-pix_fmt", "yuv420p",
	"-c:a", "aac", "-b:a", "320k", "-ar", "48000",
	"-movflags", "+faststart", "-shortest", out,
], { stdio: ["pipe", "inherit", "inherit"] });

// CDP's fast PNG path is several times quicker than page.screenshot here
const cdp = await page.context().newCDPSession(page);
const frames = Math.round(duration * fps);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
	await page.evaluate((t) => window.WALK.frame(t), i / fps);
	const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
	const png = Buffer.from(data, "base64");
	if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
	if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${frames} · ${((Date.now() - t0) / 1000 / Math.max(1, i)).toFixed(2)} s/frame`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
fs.unlinkSync(wavPath);
const thumb = out.replace(/(-\d+p\d*)?\.mp4$/, "-thumbnail.jpg");
await new Promise((r) => spawn(ffmpeg, ["-y", "-loglevel", "error", "-ss", process.env.THUMB_T ?? "31", "-i", out, "-frames:v", "1", "-vf", "scale=1280:720:flags=lanczos", "-q:v", "2", thumb], { stdio: "inherit" }).on("close", r));
console.log(`\nwrote ${path.relative(process.cwd(), out)}`);
