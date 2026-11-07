import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'tests', 'e2e', 'out');
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'mock', '--port', '5199', '--strictPort'], { cwd: root, stdio: 'ignore' });
const BASE = 'http://localhost:5199/';

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('vite não respondeu');
}

const problems = [];

try {
  await waitForServer();
  const browser = await chromium.launch({ channel: 'chrome' });

  const open = async (query, size = { width: 1240, height: 792 }, options = {}) => {
    const context = await browser.newContext({ viewport: size, ...options });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    await page.goto(BASE + query);
    await page.waitForSelector('.topbar');
    await page.evaluate(() => document.fonts.ready);
    return page;
  };

  const overflow = async (page, name) => {
    const bad = await page.evaluate(() => {
      const view = document.querySelector('.view');
      const list = [];
      if (view.scrollWidth > view.clientWidth + 1) list.push(`scroll horizontal ${view.scrollWidth}>${view.clientWidth}`);
      return list;
    });
    bad.forEach((item) => problems.push(`${name}: ${item}`));
  };

  const shot = async (page, name) => {
    await page.waitForTimeout(450);
    await overflow(page, name);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };

  let page = await open('?emptyqueue&emptyhistory');
  await shot(page, '01-vazio');

  page = await open('');
  await shot(page, '02-vazio-com-fila');

  await page.fill('#link', 'https://exemplo.com/lento');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.frames.is-running');
  await shot(page, '03-analisando');

  page = await open('');
  await page.getByRole('button', { name: 'Colar' }).click();
  await page.waitForSelector('.options');
  await shot(page, '04-simples');

  await page.getByText('Avançado', { exact: true }).click();
  await shot(page, '05-avancado');

  await page.getByText('Só áudio', { exact: true }).click();
  await shot(page, '06-avancado-audio');

  page = await open('?emptyqueue');
  await page.fill('#link', 'https://www.tiktok.com/@a/video/1');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.options');
  await shot(page, '07-vertical-simples');
  await page.locator('.download-button').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, '08-na-fila.png') });

  page = await open('?emptyqueue');
  await page.fill('#link', 'https://site.com/privado');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.error-note');
  await shot(page, '09-erro');

  page = await open('?emptyqueue');
  await page.fill('#link', 'isto não é link');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.error-note');
  await shot(page, '10-link-invalido');

  page = await open('');
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await shot(page, '11-historico');

  page = await open('');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await shot(page, '12-ajustes');

  page = await open('', { width: 880, height: 620 });
  await page.getByRole('button', { name: 'Colar' }).click();
  await page.waitForSelector('.options');
  await shot(page, '13-janela-minima');

  page = await open('', { width: 390, height: 844 });
  await page.getByRole('button', { name: 'Colar' }).click();
  await page.waitForSelector('.options');
  await shot(page, '14-estreito');

  page = await open('?worst');
  await page.getByRole('button', { name: 'Colar' }).click();
  await page.waitForSelector('.options');
  await shot(page, '15-pior-caso');
  await page.getByText('Avançado', { exact: true }).click();
  await shot(page, '16-pior-caso-avancado');
  const clear = await page.evaluate(() => {
    const button = document.querySelector('.download-button').getBoundingClientRect();
    const rail = document.querySelector('.rail').getBoundingClientRect();
    return button.right <= rail.left;
  });
  if (!clear) problems.push('pior caso: botão Baixar invadiu a fila');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await shot(page, '17-pior-caso-ajustes');

  page = await open('?emptyqueue');
  await page.getByRole('button', { name: 'Colar' }).click();
  await page.waitForSelector('.options');
  await page.locator('input[name="preset"]:checked').focus();
  await page.keyboard.press('ArrowDown');
  const keyboard = await page.evaluate(() => ({
    selected: document.querySelector('input[name="preset"]:checked').closest('.preset').querySelector('.preset-name').textContent,
    ring: getComputedStyle(document.querySelector('input[name="preset"]:checked').closest('.preset')).outlineStyle,
  }));
  if (keyboard.selected !== 'Alta qualidade') problems.push(`teclado: seta não trocou o preset (${keyboard.selected})`);
  if (keyboard.ring !== 'solid') problems.push('teclado: preset focado sem anel de foco');
  await page.locator('.download-button').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.queue-row');
  const live = await page.locator('.rail [aria-live]').textContent();
  if (!live.startsWith('Na fila')) problems.push(`leitor de tela: anúncio ausente (${live})`);
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, input, a')].filter((el) => !(el.innerText || el.getAttribute('aria-label') || el.labels?.length || el.getAttribute('title'))).map((el) => el.outerHTML.slice(0, 80)),
  );
  if (unnamed.length) problems.push(`controles sem nome: ${unnamed.join(' | ')}`);

  page = await open('', { width: 1240, height: 792 }, { reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Colar' }).click();
  await page.waitForSelector('.options');
  const moving = await page.evaluate(() => getComputedStyle(document.querySelector('.reveal')).animationName);
  if (moving !== 'swap') problems.push(`movimento reduzido: reveal usa ${moving}`);

  await browser.close();
} finally {
  server.kill();
}

console.log(problems.length ? `PROBLEMAS:\n${[...new Set(problems)].join('\n')}` : 'Sem erros de console nem scroll horizontal.');
