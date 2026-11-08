/**
 * Records the README demo GIF from a built site.
 *
 *   npm run demo -- <site-dir> [out-dir]
 *
 * Needs Google Chrome and ffmpeg. Frames come from the DevTools screencast at 2x so the GIF stays sharp.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startStaticServer } from '../src/preview.ts';

const siteDir = path.resolve(process.argv[2] ?? 'dist');
const outDir = path.resolve(process.argv[3] ?? 'docs');
const PHONE = { width: 390, height: 780 };

const { server, url: base } = await startStaticServer({ root: siteDir, base: '/techcrema/' }, 0);

const browser = await chromium.launch({ channel: 'chrome' });
await mkdir(outDir, { recursive: true });

const ctx = await browser.newContext({
  viewport: PHONE,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
});
const page = await ctx.newPage();
await page.goto(base);
const forYou = page.getByRole('region', { name: 'For you' });
await forYou.getByRole('article').first().waitFor();
await page.waitForTimeout(500);

const framesDir = await mkdtemp(path.join(tmpdir(), 'tc-demo-'));
const frames: { file: string; t: number }[] = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = path.join(framesDir, `${String(frames.length).padStart(5, '0')}.jpg`);
  frames.push({ file, t: metadata.timestamp ?? 0 });
  await writeFile(file, Buffer.from(data, 'base64'));
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 92,
  maxWidth: PHONE.width * 2,
  maxHeight: PHONE.height * 2,
});

const pause = (ms: number) => page.waitForTimeout(ms);
/** Smooth scroll by `dy` pixels over `ms` */
async function scrollBy(dy: number, ms: number) {
  await page.evaluate(
    ({ dy, ms }) =>
      new Promise<void>((done) => {
        const start = scrollY;
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / ms);
          scrollTo(0, start + dy * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2));
          p < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      }),
    { dy, ms },
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
await page
  .getByRole('navigation', { name: 'Sections' })
  .getByRole('link', { name: /^Trending/ })
  .tap();
await pause(1300);
// 3. Mute a site; the section is refilled from spares
await page.evaluate(() => scrollTo(0, 0));
await forYou.scrollIntoViewIfNeeded();
await page.evaluate(() => scrollBy(0, -70));
await pause(700);
// A Hacker News link usually comes from a site that appears once, so the refill from spares is visible
const hnStory = forYou.getByRole('article').filter({ has: page.getByRole('link', { name: /^Discussion on HN/ }) });
await hnStory.first().getByRole('button', { name: 'Mute' }).tap();
await pause(1000);
await page
  .getByRole('dialog')
  .getByRole('checkbox', { name: /^Site:/ })
  .check();
await pause(700);
await page.getByRole('dialog').getByRole('button', { name: 'Mute', exact: true }).tap();
await pause(1800);
// 4. Save one for later and open the Later tab
await forYou.getByRole('article').first().getByRole('button', { name: 'Read later' }).tap();
await pause(600);
await page.getByRole('link', { name: /Later/ }).tap();
await pause(1400);
await page.getByRole('link', { name: /Today/ }).tap();
await pause(500);
// 5. Dark mode
await page.getByRole('button', { name: /^Theme:/ }).tap();
await pause(300);
await page.getByRole('button', { name: /^Theme:/ }).tap();
await pause(1800);

await cdp.send('Page.stopScreencast');
await pause(200);
await browser.close();
server.close();

// Each frame stays on screen until the next one; the last one is held briefly
const lines = [];
for (const [i, frame] of frames.entries()) {
  const next = frames[i + 1];
  const duration = next ? next.t - frame.t : 1.5;
  lines.push(`file '${frame.file}'`, `duration ${Math.max(duration, 0.01).toFixed(3)}`);
}
lines.push(`file '${frames.at(-1)?.file}'`);
const list = path.join(framesDir, 'list.txt');
await writeFile(list, lines.join('\n'));

const gif = path.join(outDir, 'demo.gif');
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  list,
  '-vf',
  `fps=12,scale=${PHONE.width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
  gif,
]);
await rm(framesDir, { recursive: true, force: true });
console.log(`Wrote ${gif} (${frames.length} frames)`);
