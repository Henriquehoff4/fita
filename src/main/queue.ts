import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FILE_PREFIX, downloadArgs } from '../shared/args';
import { ERRORS, classifyError } from '../shared/errors';
import { createProgressTracker } from '../shared/progress';
import type { EnqueueRequest, HistoryEntry, QueueItem, Settings } from '../shared/types';
import { eachLine, killTree, spawnHidden } from './process';

const EMIT_INTERVAL = 120;

export interface QueueDeps {
  tempRoot: string;
  ytdlp(): string | null;
  ffmpegDir(): string | null;
  settings(): Settings;
  addHistory(entry: HistoryEntry): Promise<void>;
  emit(items: QueueItem[]): void;
}

interface Running {
  child: ChildProcess;
  canceled: boolean;
}

export class DownloadQueue {
  private items: QueueItem[] = [];
  private running = new Map<string, Running>();
  private emitTimer: NodeJS.Timeout | null = null;

  constructor(private deps: QueueDeps) {}

  list(): QueueItem[] {
    return this.items;
  }

  find(id: string): QueueItem | undefined {
    return this.items.find((item) => item.id === id);
  }

  get activeCount(): number {
    return this.items.filter((item) => ['queued', 'downloading', 'finalizing'].includes(item.status)).length;
  }

  private emitSoon(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.deps.emit(this.items);
    }, EMIT_INTERVAL);
  }

  private emitNow(): void {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    this.deps.emit(this.items);
  }

  enqueue(request: EnqueueRequest): void {
    this.items = [
      {
        id: randomUUID(),
        url: request.url,
        title: request.title.slice(0, 500),
        thumbnail: request.thumbnail,
        platform: request.platform.slice(0, 60),
        plan: request.plan,
        status: 'queued',
        segmentFractions: request.plan.segments.map(() => 0),
        fraction: 0,
        stage: 'Na fila',
        speed: null,
        eta: null,
        downloaded: null,
        total: null,
      },
      ...this.items,
    ];
    this.emitNow();
    this.pump();
  }

  pump(): void {
    const limit = this.deps.settings().concurrency;
    const waiting = this.items.filter((item) => item.status === 'queued').reverse();
    for (const item of waiting) {
      if (this.running.size >= limit) break;
      void this.start(item);
    }
  }

  private fail(item: QueueItem, error: QueueItem['error']): void {
    item.status = 'error';
    item.error = error;
    item.stage = 'Falhou';
    item.speed = null;
    item.eta = null;
    this.emitNow();
    this.pump();
  }

  private async start(item: QueueItem): Promise<void> {
    const ytdlp = this.deps.ytdlp();
    if (!ytdlp) {
      this.fail(item, ERRORS.noTool());
      return;
    }
    const needsFfmpeg = item.plan.finalize || item.plan.formatIds.length > 1;
    const ffmpegDir = this.deps.ffmpegDir();
    if (needsFfmpeg && !ffmpegDir) {
      this.fail(item, ERRORS.noFfmpeg());
      return;
    }

    const settings = this.deps.settings();
    const tempDir = path.join(this.deps.tempRoot, item.id);
    item.status = 'downloading';
    item.stage = 'Conectando';
    const entry: Running = { child: null as unknown as ChildProcess, canceled: false };
    this.running.set(item.id, entry);
    this.emitNow();

    try {
      await fs.mkdir(settings.folder, { recursive: true });
      await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
      this.running.delete(item.id);
      this.fail(item, classifyError(`ERROR: Permission denied ${String(error)}`));
      return;
    }

    const tracker = createProgressTracker(item.plan);
    const args = downloadArgs(item.url, item.plan, { folder: settings.folder, tempDir, ffmpegDir, cookies: settings.cookies });
    const child = spawnHidden(ytdlp, args);
    entry.child = child;
    if (entry.canceled) killTree(child);

    let stderr = '';
    let filePath: string | undefined;

    eachLine(child.stdout!, (line) => {
      if (line.startsWith(FILE_PREFIX)) {
        try {
          filePath = JSON.parse(line.slice(FILE_PREFIX.length)) as string;
        } catch {
          filePath = undefined;
        }
        return;
      }
      const snapshot = tracker.feed(line);
      if (!snapshot) return;
      item.segmentFractions = snapshot.segmentFractions;
      item.fraction = snapshot.fraction;
      item.stage = snapshot.stage;
      item.speed = snapshot.speed;
      item.eta = snapshot.eta;
      item.downloaded = snapshot.downloaded;
      item.total = snapshot.total;
      item.status = snapshot.finalizing ? 'finalizing' : 'downloading';
      this.emitSoon();
    });
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000);
    });

    let finished = false;
    const finish = async (code: number | null, spawnError?: Error) => {
      if (finished) return;
      finished = true;
      this.running.delete(item.id);
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      if (entry.canceled) {
        item.status = 'canceled';
        item.stage = 'Cancelado';
        item.speed = null;
        item.eta = null;
      } else if (code === 0 && !spawnError) {
        await this.complete(item, filePath);
      } else {
        this.fail(item, classifyError(spawnError ? String(spawnError) : stderr));
        return;
      }
      this.emitNow();
      this.pump();
    };

    child.on('error', (error) => void finish(null, error));
    child.on('close', (code) => void finish(code));
  }

  private async complete(item: QueueItem, filePath: string | undefined): Promise<void> {
    item.status = 'done';
    item.stage = 'Concluído';
    item.fraction = 1;
    item.segmentFractions = item.segmentFractions.map(() => 1);
    item.speed = null;
    item.eta = null;
    item.filePath = filePath;
    if (!filePath) return;
    const size = await fs.stat(filePath).then(
      (stat) => stat.size,
      () => null,
    );
    item.total = size;
    item.downloaded = size;
    await this.deps.addHistory({
      id: randomUUID(),
      url: item.url,
      title: item.title,
      thumbnail: item.thumbnail,
      platform: item.platform,
      summary: item.plan.summary,
      size,
      filePath,
      finishedAt: new Date().toISOString(),
    });
  }

  cancel(id: string): void {
    const item = this.find(id);
    if (!item) return;
    const running = this.running.get(id);
    if (running) {
      running.canceled = true;
      if (running.child) killTree(running.child);
      item.stage = 'Cancelando';
      this.emitNow();
    } else if (item.status === 'queued') {
      item.status = 'canceled';
      item.stage = 'Cancelado';
      this.emitNow();
    }
  }

  retry(id: string): void {
    const item = this.find(id);
    if (!item || !['error', 'canceled'].includes(item.status)) return;
    item.status = 'queued';
    item.stage = 'Na fila';
    item.error = undefined;
    item.fraction = 0;
    item.segmentFractions = item.plan.segments.map(() => 0);
    item.downloaded = null;
    item.total = null;
    this.emitNow();
    this.pump();
  }

  dismiss(id: string): void {
    const item = this.find(id);
    if (!item || ['downloading', 'finalizing'].includes(item.status)) return;
    this.items = this.items.filter((other) => other.id !== id);
    this.emitNow();
  }

  clearFinished(): void {
    this.items = this.items.filter((item) => !['done', 'error', 'canceled'].includes(item.status));
    this.emitNow();
  }

  shutdown(): void {
    for (const running of this.running.values()) {
      running.canceled = true;
      if (running.child) killTree(running.child);
    }
  }
}
