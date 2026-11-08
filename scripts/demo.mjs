// Records the README demo GIF and screenshots from a built site.
//
//   npm run demo -- <site-dir> [out-dir]
//
// <site-dir> is a built site (dist/ or TECH_CATCHUP_OUT_DIR). Needs Google Chrome and ffmpeg.
// Frames come from the Chrome DevTools screencast at 2x so the GIF stays sharp.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const siteDir = path.resolve(process.argv[2] ?? 'dist');
const outDir = path.resolve(process.argv[3] ?? 'docs');
const PHONE = { width: 390, height: 780 };

// --- serve the site under /tech-catchup/ like a project page on GitHub Pages ---
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/tech-catchup\/?/, '') || 'index.html';
  const file = path.join(siteDir, rel);
  if (!file.startsWith(siteDir)) return res.writeHead(404).end();
  try {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/tech-catchup/`;

const browser = await chromium.launch({ channel: 'chrome' });
await mkdir(outDir, { recursive: true });

// --- screenshots: phone light + dark, desktop dark ---
for (const [name, viewport, colorScheme] of [
  ['screenshot-light', PHONE, 'light'],
  ['screenshot-dark', PHONE, 'dark'],
  ['screenshot-desktop', { width: 1280, height: 900 }, 'dark'],
]) {
  const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 2 });
  await page.goto(base);
  await page.waitForSelector('.card');
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  await page.close();
}

// --- the GIF ---
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
const page = await ctx.newPage();
await page.goto(base);
await page.waitForSelector('#section-forYou .card');
await page.waitForTimeout(500);

const framesDir = await mkdtemp(path.join(tmpdir(), 'tc-demo-'));
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = path.join(framesDir, `${String(frames.length).padStart(5, '0')}.jpg`);
  frames.push({ file, t: metadata.timestamp });
  await writeFile(file, Buffer.from(data, 'base64'));
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: PHONE.width * 2, maxHeight: PHONE.height * 2 });

const pause = (ms) => page.waitForTimeout(ms);
/** Smooth scroll by `dy` pixels over `ms` */
async function scrollBy(dy, ms) {
  await page.evaluate(
    ([dy, ms]) =>
      new Promise((done) => {
        const start = scrollY;
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / ms);
          scrollTo(0, start + dy * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2));
          p < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      }),
    [dy, ms],
  );
}

await pause(1500);
// 1. Skim the page
await scrollBy(900, 1600);
await pause(900);
await scrollBy(900, 1600);
await pause(900);
// 2. Jump to a section from the chips
await scrollBy(-1800, 900);
await pause(500);
await page.locator('.chip', { hasText: 'Trending' }).tap();
await pause(1300);
// 3. Mute a site; the section is refilled from spares
await page.evaluate(() => scrollTo(0, 0));
await page.locator('#section-forYou').scrollIntoViewIfNeeded();
await page.evaluate(() => scrollBy(0, -70));
await pause(700);
const card = page.locator('#section-forYou .card').first();
await card.getByRole('button', { name: 'Mute' }).tap();
await pause(1000);
await page.locator('#mute-options input[name="domain"]').check();
await pause(700);
await page.locator('#mute-submit').tap();
await pause(1800);
// 4. Save one for later and open the Later tab
await page.locator('#section-forYou .card').first().getByRole('button', { name: 'Read later' }).tap();
await pause(600);
await page.getByRole('link', { name: /Later/ }).tap();
await pause(1400);
await page.getByRole('link', { name: /Today/ }).tap();
await pause(500);
// 5. Dark mode
await page.locator('#theme').tap();
await pause(300);
await page.locator('#theme').tap();
await pause(1800);

await cdp.send('Page.stopScreencast');
await pause(200);
await browser.close();
server.close();

// Each frame stays on screen until the next one; the last one is held briefly
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const dur = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 1.5;
  lines.push(`file '${frames[i].file}'`, `duration ${Math.max(dur, 0.01).toFixed(3)}`);
}
lines.push(`file '${frames.at(-1).file}'`);
const list = path.join(framesDir, 'list.txt');
await writeFile(list, lines.join('\n'));

const gif = path.join(outDir, 'demo.gif');
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-vf', `fps=12,scale=${PHONE.width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
  gif,
]);
await rm(framesDir, { recursive: true, force: true });
console.log(`Wrote ${gif} (${frames.length} frames) and screenshots in ${outDir}`);
