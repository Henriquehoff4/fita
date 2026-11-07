import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebStream } from 'node:stream/web';
import type { InstallProgress, ToolState, ToolsStatus, UpdateResult } from '../shared/types';
import { runForOutput } from './process';

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';
const YTDLP_ASSET = IS_WIN ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux';
const YTDLP_BASE = 'https://github.com/yt-dlp/yt-dlp/releases';
const FFMPEG_ASSET = 'ffmpeg-master-latest-win64-gpl.zip';
const FFMPEG_BASE = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download';

type Report = (progress: InstallProgress) => void;

function findOnPath(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name + EXE);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function download(url: string, target: string, onFraction: (fraction: number | null) => void): Promise<string> {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} em ${url}`);
  const total = Number(response.headers.get('content-length')) || null;
  const hash = createHash('sha256');
  let received = 0;
  const source = Readable.fromWeb(response.body as unknown as WebStream);
  source.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    onFraction(total ? received / total : null);
  });
  await pipeline(source, createWriteStream(target));
  return hash.digest('hex');
}

async function expectedHash(url: string, asset: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  const line = (await response.text()).split(/\r?\n/).find((row) => row.trim().split(/\s+/)[1]?.replace(/^[*.\/]+/, '') === asset);
  const hash = line?.trim().split(/\s+/)[0];
  if (!hash) throw new Error(`Soma de verificação ausente para ${asset}`);
  return hash.toLowerCase();
}

async function latestTag(): Promise<string> {
  const response = await fetch(`${YTDLP_BASE}/latest`, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const tag = response.headers.get('location')?.match(/\/tag\/([^/?#]+)/)?.[1];
  if (!tag) throw new Error('Não foi possível descobrir a última versão do yt-dlp');
  return tag;
}

export class Tools {
  private cache: ToolsStatus | null = null;

  constructor(private binDir: string) {}

  private managed(name: string): string {
    return path.join(this.binDir, name + EXE);
  }

  private locate(name: string): { file: string | null; managed: boolean } {
    const own = this.managed(name);
    if (existsSync(own)) return { file: own, managed: true };
    return { file: findOnPath(name), managed: false };
  }

  ytdlp(): string | null {
    return this.locate('yt-dlp').file;
  }

  ffmpegDir(): string | null {
    const { file } = this.locate('ffmpeg');
    return file ? path.dirname(file) : null;
  }

  private async state(name: string, versionArgs: string[], parse: (output: string) => string | null): Promise<ToolState> {
    const { file, managed } = this.locate(name);
    if (!file) return { found: false, version: null, managed: false };
    const output = await runForOutput(file, versionArgs);
    return { found: output !== null, version: output ? parse(output) : null, managed };
  }

  async status(refresh = false): Promise<ToolsStatus> {
    if (this.cache && !refresh) return this.cache;
    const [ytdlp, ffmpeg, deno] = await Promise.all([
      this.state('yt-dlp', ['--version'], (output) => output.trim() || null),
      this.state('ffmpeg', ['-version'], (output) => output.match(/ffmpeg version (\S+)/)?.[1] ?? null),
      this.state('deno', ['--version'], (output) => output.match(/deno (\S+)/)?.[1] ?? null),
    ]);
    this.cache = { ytdlp, ffmpeg, deno, canInstallFfmpeg: IS_WIN };
    return this.cache;
  }

  async updateYtdlp(report: Report): Promise<UpdateResult> {
    try {
      report({ tool: 'ytdlp', phase: 'checking', fraction: null });
      const tag = await latestTag();
      const current = await this.status(true);
      if (current.ytdlp.version === tag) return { ok: true, updated: false, version: tag };

      await fs.mkdir(this.binDir, { recursive: true });
      const temp = this.managed('yt-dlp.new');
      const base = `${YTDLP_BASE}/download/${tag}`;
      const expected = await expectedHash(`${base}/SHA2-256SUMS`, YTDLP_ASSET);
      const actual = await download(`${base}/${YTDLP_ASSET}`, temp, (fraction) =>
        report({ tool: 'ytdlp', phase: 'downloading', fraction }),
      );
      report({ tool: 'ytdlp', phase: 'verifying', fraction: null });
      if (actual !== expected) {
        await fs.rm(temp, { force: true });
        throw new Error('A soma de verificação do yt-dlp não confere. O arquivo foi descartado.');
      }
      if (!IS_WIN) await fs.chmod(temp, 0o755);
      const version = (await runForOutput(temp, ['--version'], 60000))?.trim();
      if (!version) {
        await fs.rm(temp, { force: true });
        throw new Error('O novo yt-dlp não abriu. A versão atual foi mantida.');
      }
      report({ tool: 'ytdlp', phase: 'installing', fraction: null });
      await fs.rename(temp, this.managed('yt-dlp'));
      await this.status(true);
      return { ok: true, updated: true, version };
    } catch (error) {
      return { ok: false, error: { code: 'update', title: 'O yt-dlp não pôde ser atualizado', hint: 'Verifique a sua internet e tente de novo.', detail: String(error) } };
    }
  }

  async installFfmpeg(report: Report): Promise<UpdateResult> {
    if (!IS_WIN) {
      return { ok: false, error: { code: 'ffmpeg', title: 'Instale o ffmpeg pelo sistema', hint: 'Use o gerenciador de pacotes do seu sistema e reabra o app.' } };
    }
    const work = path.join(this.binDir, 'ffmpeg-install');
    try {
      report({ tool: 'ffmpeg', phase: 'checking', fraction: null });
      await fs.rm(work, { recursive: true, force: true });
      await fs.mkdir(work, { recursive: true });
      const expected = await expectedHash(`${FFMPEG_BASE}/checksums.sha256`, FFMPEG_ASSET);
      const zip = path.join(work, FFMPEG_ASSET);
      const actual = await download(`${FFMPEG_BASE}/${FFMPEG_ASSET}`, zip, (fraction) =>
        report({ tool: 'ffmpeg', phase: 'downloading', fraction }),
      );
      report({ tool: 'ffmpeg', phase: 'verifying', fraction: null });
      if (actual !== expected) throw new Error('A soma de verificação do ffmpeg não confere. O arquivo foi descartado.');
      report({ tool: 'ffmpeg', phase: 'installing', fraction: null });
      const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
      if ((await runForOutput(tar, ['-xf', zip, '-C', work], 180000)) === null) throw new Error('Não foi possível extrair o ffmpeg.');
      const folder = (await fs.readdir(work, { withFileTypes: true })).find((entry) => entry.isDirectory());
      if (!folder) throw new Error('O pacote do ffmpeg veio vazio.');
      for (const name of ['ffmpeg.exe', 'ffprobe.exe']) {
        await fs.copyFile(path.join(work, folder.name, 'bin', name), path.join(this.binDir, name));
      }
      const status = await this.status(true);
      return { ok: true, updated: true, version: status.ffmpeg.version ?? 'instalado' };
    } catch (error) {
      return { ok: false, error: { code: 'update', title: 'O ffmpeg não pôde ser instalado', hint: 'Verifique a sua internet e tente de novo.', detail: String(error) } };
    } finally {
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
