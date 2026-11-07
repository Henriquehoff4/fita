import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'tests', 'e2e', 'out');

const SITES = [
  ['TikTok', 'https://www.tiktok.com/@leenabhushan/video/6748451240264420610'],
  ['Instagram', 'https://www.instagram.com/reel/CDUMkliABpa/'],
  ['Vimeo', 'https://vimeo.com/76979871'],
  ['X', 'https://twitter.com/freethenipple/status/643211948184596480'],
  ['Reddit', 'https://www.reddit.com/r/videos/comments/6rrwyj/that_small_heart_attack/'],
  ['Facebook', 'https://www.facebook.com/video.php?v=637842556329505'],
  ['Dailymotion', 'https://www.dailymotion.com/video/x5kesuj'],
  ['SoundCloud', 'https://soundcloud.com/ethmusic/lostin-powers-she-so-heavy'],
];

const work = mkdtempSync(path.join(os.tmpdir(), 'fita-sites-'));
const data = path.join(work, 'data');
mkdirSync(data);
writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ folder: path.join(work, 'saida'), concurrency: 2, cookies: 'none' }));

const app = await electron.launch({ args: [root], env: { ...process.env, FITA_USER_DATA: data } });
const page = await app.firstWindow();
await page.waitForSelector('.topbar');

for (const [name, url] of SITES) {
  const result = await page.evaluate((target) => window.fita.analyze(target), url);
  if (!result.ok) {
    console.log(`${name}: análise recusada — ${result.error.title} | ${(result.error.detail ?? '').split('\n').pop().slice(0, 150)}`);
    continue;
  }
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), url);
  await page.getByRole('button', { name: /Colar|Analisar/ }).click();
  await page.waitForSelector(`.media-title`, { timeout: 120000 });
  await page.waitForFunction((title) => document.querySelector('.media-title')?.textContent === title, result.info.title, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shots, `site-${name}.png`) });

  const rows = await page.locator('.preset').evaluateAll((list) => list.map((row) => `${row.querySelector('.preset-name').textContent}: ${row.querySelector('.preset-detail').textContent}`));
  const enabled = page.locator('.preset:not(.is-disabled)');
  await enabled.nth((await enabled.count()) - 1).click();
  const before = (await page.evaluate(() => window.fita.getQueue())).length;
  await page.locator('.download-button').click();
  let item;
  for (let tries = 0; tries < 400; tries += 1) {
    const queue = await page.evaluate(() => window.fita.getQueue());
    if (queue.length > before && ['done', 'error'].includes(queue[0].status)) {
      item = queue[0];
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  let file = 'sem resultado';
  if (item?.status === 'done') {
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', item.filePath], { encoding: 'utf8' }));
    file = `baixado: ${path.extname(item.filePath)} ${probe.streams.map((s) => s.codec_name).join('+')}`;
  } else if (item) {
    file = `erro: ${item.error?.title}`;
  }
  console.log(`${name}: ${result.info.platform} · ${result.info.streams.length} formatos · ${file}\n   ${rows.join('\n   ')}`);
}

await app.close();
rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
