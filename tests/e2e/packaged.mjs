import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = mkdtempSync(path.join(os.tmpdir(), 'fita-pack-'));
const data = path.join(work, 'data');
mkdirSync(data);
writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ folder: path.join(work, 'saida'), concurrency: 2, cookies: 'none' }));

const app = await electron.launch({ executablePath: path.join(root, 'release', 'win-unpacked', 'Fita.exe'), env: { ...process.env, FITA_USER_DATA: data } });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.waitForSelector('.topbar');
await app.evaluate(({ clipboard }) => clipboard.writeText('https://www.youtube.com/watch?v=jNQXAC9IVRw'));
await page.getByRole('button', { name: 'Colar' }).click();
await page.waitForSelector('.options', { timeout: 120000 });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(root, 'tests', 'e2e', 'out', 'pacote-simples.png') });
await page.locator('.download-button').click();

let item;
for (let tries = 0; tries < 300 && !item; tries += 1) {
  const [first] = await page.evaluate(() => window.fita.getQueue());
  if (first && ['done', 'error'].includes(first.status)) item = first;
  await new Promise((resolve) => setTimeout(resolve, 300));
}
console.log('status:', item?.status, item?.error?.title ?? '');
if (item?.filePath) {
  console.log(path.basename(item.filePath));
  console.log(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', item.filePath], { encoding: 'utf8' }).trim().replace(/\s+/g, ' + '));
}
console.log('erros de console/página:', errors.length ? errors : 'nenhum');
console.log('ferramentas:', JSON.stringify(await page.evaluate(() => window.fita.getTools())));
await app.close();
rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
process.exitCode = item?.status === 'done' && errors.length === 0 ? 0 : 1;
