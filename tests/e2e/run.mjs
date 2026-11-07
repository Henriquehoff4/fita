import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'tests', 'e2e', 'out');
mkdirSync(shots, { recursive: true });

const SHORT = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const LONG = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const SITES = (process.env.FITA_SITES ?? '').split(',').filter(Boolean);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name:stream=codec_type,codec_name', '-of', 'json', file], { encoding: 'utf8' });
  const data = JSON.parse(out);
  return {
    format: data.format.format_name,
    video: data.streams.find((s) => s.codec_type === 'video')?.codec_name ?? null,
    audio: data.streams.find((s) => s.codec_type === 'audio')?.codec_name ?? null,
  };
}

async function launch(userData, folder, env = {}) {
  mkdirSync(userData, { recursive: true });
  writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ folder, concurrency: 2, cookies: 'none' }));
  const app = await electron.launch({ args: [root], env: { ...process.env, FITA_USER_DATA: userData, ...env } });
  const page = await app.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`  console: ${message.text()}`);
  });
  page.on('pageerror', (error) => console.log(`  pageerror: ${error.message}`));
  await page.waitForSelector('.topbar');
  return { app, page };
}

const paste = async (app, page, url) => {
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), url);
  await page.getByRole('button', { name: 'Colar' }).click();
};

const analyzed = (page) => page.waitForSelector('.options, .error-note', { timeout: 120000 });

async function poll(check, timeout, label) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`tempo esgotado: ${label}`);
}

const getQueue = (page) => page.evaluate(() => window.fita.getQueue());

const waitQueue = (page, id, statuses, timeout = 240000) =>
  poll(async () => {
    const item = (await getQueue(page)).find((entry) => entry.id === id);
    return item && statuses.includes(item.status) ? item : null;
  }, timeout, `fila ${statuses}`);

async function downloadCurrent(page) {
  const before = (await getQueue(page)).length;
  await page.locator('.download-button').click();
  await poll(async () => (await getQueue(page)).length > before, 10000, 'entrar na fila');
  const { id } = (await getQueue(page))[0];
  return waitQueue(page, id, ['done', 'error', 'canceled']);
}

async function main() {
  const work = mkdtempSync(path.join(os.tmpdir(), 'fita-e2e-'));
  const folder = path.join(work, 'Baixados com acentuação');
  const { app, page } = await launch(path.join(work, 'data'), folder);

  const look = await page.evaluate(async () => {
    await document.fonts.ready;
    const probeWidth = (text) => {
      const span = document.createElement('span');
      span.className = 'num';
      span.textContent = text;
      document.body.append(span);
      const width = span.getBoundingClientRect().width;
      span.remove();
      return width;
    };
    return {
      font: document.fonts.check('14px "Instrument Sans Variable"'),
      display: document.fonts.check('24px "Bricolage Grotesque Variable"'),
      tabular: Math.abs(probeWidth('1111') - probeWidth('0000')) < 0.01,
      node: typeof window.require,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content.includes("script-src 'self'"),
      api: typeof window.fita.analyze,
    };
  });
  check('Fontes carregadas no app empacotável', look.font && look.display);
  check('Números tabulares reais', look.tabular);
  check('Renderer isolado, sem Node', look.node === 'undefined' && look.api === 'function');
  check('CSP aplicada', look.csp === true);

  await paste(app, page, `olha esse vídeo aqui: ${SHORT} !`);
  await page.waitForSelector('.frames.is-running');
  await page.screenshot({ path: path.join(shots, 'real-analisando.png') });
  await analyzed(page);
  const title = await page.locator('.media-title').textContent();
  check('Colar lê a área de transferência e analisa', title?.includes('Me at the zoo'), title ?? '');
  check('Mostra a plataforma', (await page.locator('.media-meta').textContent())?.includes('YouTube'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, 'real-simples.png') });

  const rows = page.locator('.preset');
  const summaries = await rows.locator('.preset-detail').allTextContents();
  console.log(`  presets: ${summaries.join(' | ')}`);
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const name = await row.locator('.preset-name').textContent();
    if (await row.locator('input').isDisabled()) {
      console.log(`  ${name}: indisponível (${await row.locator('.preset-detail').textContent()})`);
      continue;
    }
    await row.click();
    const item = await downloadCurrent(page);
    if (item.status !== 'done') {
      check(`Preset ${name}`, false, item.error?.detail ?? item.status);
      continue;
    }
    const info = probe(item.filePath);
    const expected = item.plan.container;
    const formatOk = expected === 'mp3' ? info.audio === 'mp3' && !info.video : info.format.includes(expected === 'mkv' ? 'matroska' : expected === 'webm' ? 'webm' : 'mp4') && !!info.video && !!info.audio;
    check(`Preset ${name}`, formatOk, `${item.plan.summary} → ${path.basename(item.filePath)} (${info.format}, ${info.video}, ${info.audio})`);
  }

  await page.getByText('Avançado', { exact: true }).click();
  await page.waitForSelector('.advanced');
  await page.screenshot({ path: path.join(shots, 'real-avancado.png') });

  const chip = (name, label) => page.locator(`input[name="${name}"]`).locator('xpath=..').filter({ hasText: new RegExp(`^${label}$`) }).click();
  const allowed = async (name) => page.locator(`input[name="${name}"]`).locator('xpath=..').allTextContents();

  console.log(`  avançado: resoluções ${await allowed('adv-quality')} · codecs ${await allowed('adv-vcodec')} · áudio ${await allowed('adv-acodec')} · formato ${await allowed('adv-container')}`);

  for (const [vcodec, acodec, container, ffFormat, ffVideo, ffAudio] of [
    ['VP9', 'Opus', 'WebM', 'webm', 'vp9', 'opus'],
    ['VP9', 'Opus', 'MP4', 'mp4', 'vp9', 'opus'],
    ['VP9', 'Opus', 'MKV', 'matroska', 'vp9', 'opus'],
    ['H.264', 'AAC', 'MP4', 'mp4', 'h264', 'aac'],
    ['H.264', 'AAC', 'MKV', 'matroska', 'h264', 'aac'],
  ]) {
    await chip('adv-vcodec', vcodec);
    await chip('adv-acodec', acodec);
    await chip('adv-container', container);
    const item = await downloadCurrent(page);
    if (item.status !== 'done') {
      check(`Avançado ${vcodec}+${acodec} em ${container}`, false, item.error?.detail ?? item.status);
      continue;
    }
    const info = probe(item.filePath);
    check(`Avançado ${vcodec}+${acodec} em ${container}`, info.format.includes(ffFormat) && info.video === ffVideo && info.audio === ffAudio, `${info.format}, ${info.video}, ${info.audio}`);
  }

  await chip('adv-mode', 'Só áudio');
  for (const [acodec, container, ffAudio] of [['AAC', 'M4A', 'aac'], ['Opus', 'OPUS', 'opus'], ['AAC', 'MP3', 'mp3']]) {
    await chip('adv-acodec', acodec);
    await chip('adv-container', container);
    const item = await downloadCurrent(page);
    if (item.status !== 'done') {
      check(`Áudio ${acodec} em ${container}`, false, item.error?.detail ?? item.status);
      continue;
    }
    const info = probe(item.filePath);
    check(`Áudio ${acodec} em ${container}`, info.audio === ffAudio && !info.video, `${path.extname(item.filePath)}, ${info.audio}`);
  }

  const history = await page.evaluate(() => window.fita.getHistory());
  check('Histórico guardou os downloads', history.length > 0 && history.every((entry) => entry.exists), `${history.length} itens`);
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await page.waitForSelector('.history-row');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, 'real-historico.png') });
  await page.getByRole('button', { name: 'Baixar', exact: true }).click();

  await page.getByLabel('Cole o link do vídeo').fill('isto não é link');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.error-note');
  check('Texto que não é link', (await page.locator('.error-title').textContent()) === 'Isto não é um link');

  for (const [url, code] of [
    ['https://www.example.com/', 'Este link não leva a um vídeo'],
    ['https://www.youtube.com/watch?v=aaaaaaaaaaa', null],
    ['https://site-que-nao-existe-fita.invalid/video', 'O site não respondeu'],
  ]) {
    await page.getByLabel('Cole o link do vídeo').fill(url);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.frames.is-running, .error-note');
    await page.waitForSelector('.error-note', { timeout: 120000 });
    const text = await page.locator('.error-title').textContent();
    check(`Erro claro para ${url}`, code ? text === code : !text.includes('não pôde ser concluído'), text ?? '');
  }

  await paste(app, page, LONG);
  await analyzed(page);
  const seen = await page.locator('.preset').first().locator('.preset-detail').textContent();
  console.log(`  vídeo longo: ${seen}`);
  await page.locator('.preset').nth(1).click();
  await page.locator('.download-button').click();
  await poll(async () => (await getQueue(page))[0]?.fraction > 0.02, 90000, 'progresso');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, 'real-baixando.png') });
  const running = (await getQueue(page))[0];
  check('Progresso com velocidade e tempo restante', running.speed > 0 && running.eta !== null, `${Math.round(running.fraction * 100)}%, ${running.stage}`);
  await page.evaluate((id) => window.fita.cancel(id), running.id);
  await waitQueue(page, running.id, ['canceled'], 30000);
  await page.waitForTimeout(800);
  const leftovers = readdirSync(path.join(work, 'data', 'tmp'));
  check('Cancelar apaga os arquivos temporários', leftovers.length === 0, leftovers.join(','));
  const partial = readdirSync(folder).filter((file) => file.includes('aqz-KE-bpKQ'));
  check('Cancelar não deixa arquivo pela metade no destino', partial.length === 0, partial.join(','));

  for (const url of SITES) {
    await paste(app, page, url);
    await analyzed(page);
    const failed = await page.locator('.error-note').count();
    if (failed) {
      console.log(`  SITE ${url}: ${await page.locator('.error-title').textContent()}`);
      results.push({ name: `site ${url}`, ok: null });
      continue;
    }
    const platform = await page.locator('.media-meta').textContent();
    const available = await page.locator('.preset').evaluateAll((list) => list.filter((row) => !row.querySelector('input').disabled).map((row) => row.querySelector('.preset-detail').textContent));
    await page.locator('.preset:not(.is-disabled)').first().click();
    const item = await downloadCurrent(page);
    const info = item.status === 'done' ? probe(item.filePath) : null;
    check(`Site ${url}`, item.status === 'done', `${platform} · ${available.length} presets · ${info ? `${info.format}, ${info.video}, ${info.audio}` : item.error?.title}`);
  }

  await app.close();

  const firstRun = path.join(work, 'firstrun');
  const emptyPath = [path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')].join(path.delimiter);
  const fresh = await launch(firstRun, folder, { PATH: emptyPath });
  const missing = await fresh.page.evaluate(() => window.fita.getTools());
  check('Sem ferramentas: o app abre e avisa', !missing.ytdlp.found && (await fresh.page.locator('.setup-note').count()) === 1);
  await fresh.page.screenshot({ path: path.join(shots, 'real-primeiro-uso.png') });
  const ytdlp = await fresh.page.evaluate(() => window.fita.updateYtdlp());
  check('Instala o yt-dlp com soma verificada', ytdlp.ok && ytdlp.updated, JSON.stringify(ytdlp).slice(0, 160));
  const size = existsSync(path.join(firstRun, 'bin', 'yt-dlp.exe')) ? statSync(path.join(firstRun, 'bin', 'yt-dlp.exe')).size : 0;
  check('Arquivo do yt-dlp no lugar', size > 1_000_000, `${Math.round(size / 1024 / 1024)} MB`);
  const again = await fresh.page.evaluate(() => window.fita.updateYtdlp());
  check('Atualizar de novo reconhece a última versão', again.ok && !again.updated, JSON.stringify(again));
  const ffmpeg = await fresh.page.evaluate(() => window.fita.installFfmpeg());
  check('Instala o ffmpeg com soma verificada', ffmpeg.ok, JSON.stringify(ffmpeg).slice(0, 200));
  const after = await fresh.page.evaluate(() => window.fita.getTools());
  check('Ferramentas prontas após instalar', after.ytdlp.found && after.ytdlp.managed && after.ffmpeg.found && after.ffmpeg.managed, JSON.stringify(after));
  await fresh.app.close();

  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });

  const failed = results.filter((result) => result.ok === false);
  console.log(`\n${results.filter((r) => r.ok).length} ok, ${failed.length} falhas, ${results.filter((r) => r.ok === null).length} sites com erro do próprio site`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
