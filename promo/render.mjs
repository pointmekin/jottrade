import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 60;
const DURATION = 15;
// Sub-frames per output frame. ffmpeg averages them into real motion blur.
const SUBFRAMES = Number(process.env.SUBFRAMES ?? 4);
const stillsArg = process.argv.find((a) => a.startsWith("--stills="));

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${path.join(dir, "promo.html")}?capture`);
await page.evaluate(() => window.ready);

const frameAt = async (t) => {
  await page.evaluate((time) => window.render(time), t);
  return page.screenshot({ type: "jpeg", quality: 96 });
};

if (stillsArg) {
  const outDir = path.join(dir, "stills");
  await mkdir(outDir, { recursive: true });
  for (const t of stillsArg.slice(9).split(",").map(Number)) {
    await writeFile(path.join(outDir, `t${t.toFixed(2)}.jpg`), await frameAt(t));
  }
} else {
  const out = path.join(dir, "jottrade-promo.mp4");
  const blur = SUBFRAMES > 1 ? [`tmix=frames=${SUBFRAMES}`, `select='not(mod(n+1\\,${SUBFRAMES}))'`, `setpts=N/(${FPS}*TB)`] : [];
  const ffmpeg = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS * SUBFRAMES), "-i", "-",
    ...(blur.length ? ["-vf", blur.join(",")] : []),
    "-r", String(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "14",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const total = FPS * SUBFRAMES * DURATION;
  // Spread the sub-frames over half the frame interval, like a 180° film shutter.
  const shutter = 0.5 / FPS / SUBFRAMES;
  for (let i = 0; i < total; i++) {
    const frame = Math.floor(i / SUBFRAMES);
    const sub = i % SUBFRAMES;
    const t = frame / FPS - (SUBFRAMES - 1 - sub) * shutter;
    const buf = await frameAt(Math.max(0, t));
    if (!ffmpeg.stdin.write(buf)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    if (i % 300 === 0) process.stdout.write(`\r${Math.round((i / total) * 100)}%`);
  }
  ffmpeg.stdin.end();
  await new Promise((r) => ffmpeg.on("close", r));
  console.log(`\nwrote ${out}`);
}
await browser.close();
