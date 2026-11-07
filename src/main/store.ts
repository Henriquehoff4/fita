import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CookieBrowser, HistoryEntry, Settings } from '../shared/types';

const HISTORY_LIMIT = 500;
const COOKIES: CookieBrowser[] = ['none', 'firefox', 'chrome', 'edge', 'brave', 'opera', 'vivaldi'];

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}

export function sanitizeSettings(raw: Partial<Settings> | null, fallbackFolder: string): Settings {
  const concurrency = Number(raw?.concurrency);
  return {
    folder: typeof raw?.folder === 'string' && path.isAbsolute(raw.folder) ? raw.folder : fallbackFolder,
    concurrency: Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 4 ? concurrency : 2,
    cookies: COOKIES.includes(raw?.cookies as CookieBrowser) ? (raw!.cookies as CookieBrowser) : 'none',
  };
}

export class Store {
  private settings!: Settings;
  private history: HistoryEntry[] = [];
  private writes = Promise.resolve();

  constructor(
    private dir: string,
    private fallbackFolder: string,
  ) {}

  async load(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    this.settings = sanitizeSettings(await readJson<Settings>(this.settingsFile), this.fallbackFolder);
    const history = await readJson<HistoryEntry[]>(this.historyFile);
    this.history = Array.isArray(history)
      ? history.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.filePath === 'string')
      : [];
  }

  private get settingsFile() {
    return path.join(this.dir, 'settings.json');
  }

  private get historyFile() {
    return path.join(this.dir, 'history.json');
  }

  private persist(file: string, value: unknown): Promise<void> {
    this.writes = this.writes.then(() => writeJson(file, value)).catch(() => undefined);
    return this.writes;
  }

  getSettings(): Settings {
    return { ...this.settings };
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const { folder: _ignored, ...allowed } = patch ?? {};
    this.settings = sanitizeSettings({ ...this.settings, ...allowed }, this.fallbackFolder);
    await this.persist(this.settingsFile, this.settings);
    return this.getSettings();
  }

  async setFolder(folder: string): Promise<Settings> {
    this.settings = sanitizeSettings({ ...this.settings, folder }, this.fallbackFolder);
    await this.persist(this.settingsFile, this.settings);
    return this.getSettings();
  }

  async listHistory(): Promise<HistoryEntry[]> {
    return Promise.all(
      this.history.map(async (entry) => ({
        ...entry,
        exists: await fs.access(entry.filePath).then(
          () => true,
          () => false,
        ),
      })),
    );
  }

  findHistory(id: string): HistoryEntry | undefined {
    return this.history.find((entry) => entry.id === id);
  }

  async addHistory(entry: HistoryEntry): Promise<void> {
    this.history = [entry, ...this.history.filter((other) => other.filePath !== entry.filePath)].slice(0, HISTORY_LIMIT);
    await this.persist(this.historyFile, this.history);
  }

  async removeHistory(id: string): Promise<void> {
    this.history = this.history.filter((entry) => entry.id !== id);
    await this.persist(this.historyFile, this.history);
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    await this.persist(this.historyFile, this.history);
  }
}
