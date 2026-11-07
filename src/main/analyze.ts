import type { ChildProcess } from 'node:child_process';
import { analyzeArgs } from '../shared/args';
import { ERRORS, classifyError } from '../shared/errors';
import { NormalizeError, normalizeInfo } from '../shared/normalize';
import type { AnalyzeResult, CookieBrowser } from '../shared/types';
import { isHttpUrl } from '../shared/url';
import { killTree, spawnHidden } from './process';

const TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 128 * 1024 * 1024;

export class Analyzer {
  private current: ChildProcess | null = null;

  cancel(): void {
    if (this.current) killTree(this.current);
    this.current = null;
  }

  run(ytdlp: string, url: string, cookies: CookieBrowser): Promise<AnalyzeResult> {
    if (!isHttpUrl(url)) return Promise.resolve({ ok: false, error: ERRORS.invalidLink() });
    this.cancel();

    return new Promise((resolve) => {
      const child = spawnHidden(ytdlp, analyzeArgs(url, cookies));
      this.current = child;
      const chunks: Buffer[] = [];
      let size = 0;
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
      }, TIMEOUT_MS);

      child.stdout?.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_OUTPUT) killTree(child);
        else chunks.push(chunk);
      });
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-8000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ ok: false, error: classifyError(String(error)) });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const superseded = this.current !== child;
        if (!superseded) this.current = null;
        if (superseded) {
          resolve({ ok: false, canceled: true, error: { code: 'canceled', title: '', hint: '' } });
          return;
        }
        if (timedOut) {
          resolve({ ok: false, error: ERRORS.timeout() });
          return;
        }
        if (code !== 0) {
          resolve({ ok: false, error: classifyError(stderr) });
          return;
        }
        try {
          const raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
          resolve({ ok: true, info: normalizeInfo(raw, url) });
        } catch (error) {
          if (error instanceof NormalizeError) {
            resolve({ ok: false, error: error.code === 'live' ? ERRORS.live() : ERRORS.noFormats() });
          } else {
            resolve({ ok: false, error: classifyError(`${stderr}\n${String(error)}`) });
          }
        }
      });
    });
  }
}
