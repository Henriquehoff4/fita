import { BrowserWindow, Menu, app, clipboard, dialog, ipcMain, net, session, shell } from 'electron';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { isValidPlan } from '../shared/args';
import { ERRORS } from '../shared/errors';
import type { EnqueueRequest, Settings } from '../shared/types';
import { isHttpUrl } from '../shared/url';
import { Analyzer } from './analyze';
import { DownloadQueue } from './queue';
import { Store } from './store';
import { Tools } from './tools';

const GROUND = '#0d0c0b';
const OPENABLE = new Set(['.mp4', '.mkv', '.webm', '.mp3', '.m4a', '.opus', '.mov', '.flv', '.3gp', '.ts', '.m4v', '.ogg', '.aac', '.wav', '.flac']);

if (process.env.FITA_USER_DATA) app.setPath('userData', process.env.FITA_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let quitting = false;

function send(channel: string, value: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}

function createWindow(queue: DownloadQueue): void {
  win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 880,
    minHeight: 620,
    backgroundColor: GROUND,
    show: false,
    title: 'Fita',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: GROUND, symbolColor: '#b4afa8', height: 48 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.on('close', (event) => {
    if (quitting || queue.activeCount === 0) return;
    const choice = dialog.showMessageBoxSync(win!, {
      type: 'question',
      buttons: ['Continuar baixando', 'Cancelar downloads e sair'],
      defaultId: 0,
      cancelId: 0,
      title: 'Fita',
      message: `${queue.activeCount === 1 ? 'Há 1 download' : `Há ${queue.activeCount} downloads`} em andamento.`,
      detail: 'Se sair agora, os downloads são cancelados e o que já foi baixado é apagado.',
    });
    if (choice === 0) event.preventDefault();
    else quitting = true;
  });
  void win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
}

async function openSafely(filePath: string | undefined, mode: 'open' | 'show'): Promise<boolean> {
  if (!filePath || !existsSync(filePath)) return false;
  if (mode === 'show') {
    shell.showItemInFolder(filePath);
    return true;
  }
  if (!OPENABLE.has(path.extname(filePath).toLowerCase())) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return (await shell.openPath(filePath)) === '';
}

function isEnqueueRequest(value: unknown): value is EnqueueRequest {
  const request = value as EnqueueRequest;
  return (
    !!request &&
    typeof request.url === 'string' &&
    isHttpUrl(request.url) &&
    typeof request.title === 'string' &&
    typeof request.platform === 'string' &&
    (request.thumbnail === null || (typeof request.thumbnail === 'string' && request.thumbnail.startsWith('https://'))) &&
    isValidPlan(request.plan)
  );
}

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  const userData = app.getPath('userData');
  const tempRoot = path.join(userData, 'tmp');
  await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);

  const store = new Store(userData, path.join(app.getPath('videos'), 'Fita'));
  await store.load();
  const tools = new Tools(path.join(userData, 'bin'));
  const analyzer = new Analyzer();
  const queue = new DownloadQueue({
    tempRoot,
    ytdlp: () => tools.ytdlp(),
    ffmpegDir: () => tools.ffmpegDir(),
    settings: () => store.getSettings(),
    addHistory: (entry) => store.addHistory(entry),
    emit: (items) => send('queue:update', items),
  });

  const handle = (channel: string, handler: (...args: never[]) => unknown) =>
    ipcMain.handle(channel, (_event, ...args) => (handler as (...values: unknown[]) => unknown)(...args));

  handle('clipboard:read', () => clipboard.readText());
  handle('analyze', async (url: string) => {
    const ytdlp = tools.ytdlp();
    if (!ytdlp) return { ok: false, error: ERRORS.noTool() };
    if (typeof url !== 'string' || !isHttpUrl(url)) return { ok: false, error: ERRORS.invalidLink() };
    if (!net.isOnline()) return { ok: false, error: ERRORS.offline() };
    return analyzer.run(ytdlp, url, store.getSettings().cookies);
  });
  handle('queue:add', (request: unknown) => {
    if (!isEnqueueRequest(request)) return { ok: false, error: ERRORS.invalidLink() };
    queue.enqueue(request);
    return { ok: true };
  });
  handle('queue:cancel', (id: string) => queue.cancel(id));
  handle('queue:retry', (id: string) => queue.retry(id));
  handle('queue:dismiss', (id: string) => queue.dismiss(id));
  handle('queue:clear', () => queue.clearFinished());
  handle('queue:list', () => queue.list());
  handle('queue:open', (id: string) => openSafely(queue.find(id)?.filePath, 'open'));
  handle('queue:show', (id: string) => openSafely(queue.find(id)?.filePath, 'show'));
  handle('history:list', () => store.listHistory());
  handle('history:open', (id: string) => openSafely(store.findHistory(id)?.filePath, 'open'));
  handle('history:show', (id: string) => openSafely(store.findHistory(id)?.filePath, 'show'));
  handle('history:remove', async (id: string) => {
    await store.removeHistory(id);
    return store.listHistory();
  });
  handle('history:clear', async () => {
    await store.clearHistory();
    return store.listHistory();
  });
  handle('settings:get', () => store.getSettings());
  handle('settings:update', async (patch: Partial<Settings>) => {
    const settings = await store.updateSettings(patch);
    queue.pump();
    return settings;
  });
  handle('settings:choose-folder', async () => {
    const current = store.getSettings();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Escolher pasta de destino',
      defaultPath: current.folder,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return current;
    return store.setFolder(result.filePaths[0]);
  });
  handle('settings:open-folder', async () => {
    const { folder } = store.getSettings();
    await fs.mkdir(folder, { recursive: true });
    await shell.openPath(folder);
  });
  handle('tools:status', () => tools.status(true));
  handle('tools:update-ytdlp', () => tools.updateYtdlp((progress) => send('tools:progress', progress)));
  handle('tools:install-ffmpeg', () => tools.installFfmpeg((progress) => send('tools:progress', progress)));

  createWindow(queue);

  app.on('before-quit', () => {
    quitting = true;
    queue.shutdown();
    analyzer.cancel();
  });
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
}

void app.whenReady().then(bootstrap);
app.on('window-all-closed', () => app.quit());
