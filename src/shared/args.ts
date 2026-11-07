import type { CookieBrowser, DownloadPlan } from './types';
import { isHttpUrl } from './url';

const FORMAT_ID = /^[\w.~-]{1,120}$/;
const TAG = /^[\w.-]{1,40}$/;
const CONTAINERS = new Set(['mp4', 'mkv', 'webm', 'mp3', 'm4a', 'opus', 'source']);
const BITRATES = new Set([64, 96, 128, 160, 192, 256, 320]);
const COOKIE_BROWSERS = new Set<CookieBrowser>(['firefox', 'chrome', 'edge', 'brave', 'opera', 'vivaldi']);

export const PROGRESS_PREFIX = 'FITAP ';
export const POST_PREFIX = 'FITAPP ';
export const FILE_PREFIX = 'FITAF ';

export function isValidPlan(plan: unknown): plan is DownloadPlan {
  const p = plan as DownloadPlan;
  if (!p || typeof p !== 'object') return false;
  if (p.mode !== 'video' && p.mode !== 'audio') return false;
  if (!Array.isArray(p.formatIds) || p.formatIds.length < 1 || p.formatIds.length > 2) return false;
  if (!p.formatIds.every((id) => typeof id === 'string' && FORMAT_ID.test(id))) return false;
  if (!CONTAINERS.has(p.container)) return false;
  if (typeof p.tag !== 'string' || !TAG.test(p.tag)) return false;
  if (p.mp3Bitrate !== undefined && !BITRATES.has(p.mp3Bitrate)) return false;
  if (p.mode === 'audio' && p.formatIds.length !== 1) return false;
  return Array.isArray(p.segments);
}

function cookieArgs(cookies: CookieBrowser): string[] {
  return COOKIE_BROWSERS.has(cookies) ? ['--cookies-from-browser', cookies] : [];
}

const COMMON = [
  '--ignore-config',
  '--no-playlist',
  '--playlist-items', '1',
  '--encoding', 'utf-8',
  '--no-warnings',
  '--socket-timeout', '20',
];

export function analyzeArgs(url: string, cookies: CookieBrowser): string[] {
  if (!isHttpUrl(url)) throw new Error('invalid url');
  return [...COMMON, '-J', ...cookieArgs(cookies), '--', url];
}

export interface DownloadArgsOptions {
  folder: string;
  tempDir: string;
  ffmpegDir: string | null;
  cookies: CookieBrowser;
}

export function downloadArgs(url: string, plan: DownloadPlan, options: DownloadArgsOptions): string[] {
  if (!isHttpUrl(url)) throw new Error('invalid url');
  if (!isValidPlan(plan)) throw new Error('invalid plan');

  const args = [
    ...COMMON,
    '--newline',
    '--progress',
    '--no-colors',
    '--windows-filenames',
    '--no-mtime',
    '--retries', '5',
    '--fragment-retries', '5',
    '--concurrent-fragments', '4',
    '--progress-template',
    `download:${PROGRESS_PREFIX}%(info.format_id)s|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`,
    '--progress-template',
    `postprocess:${POST_PREFIX}%(progress.status)s|%(progress.postprocessor)s`,
    '--print', `after_move:${FILE_PREFIX}%(filepath)j`,
    '-P', `home:${options.folder}`,
    '-P', `temp:${options.tempDir}`,
    '-o', `%(title).120B [%(id)s] ${plan.tag}.%(ext)s`,
    '-f', plan.formatIds.join('+'),
  ];
  if (options.ffmpegDir) args.push('--ffmpeg-location', options.ffmpegDir);
  args.push(...cookieArgs(options.cookies));

  if (plan.mode === 'audio') {
    const format = plan.container === 'm4a' || plan.container === 'opus' ? plan.container : 'mp3';
    args.push('-x', '--audio-format', format, '--embed-metadata');
    if (format === 'mp3') args.push('--audio-quality', `${plan.mp3Bitrate ?? 192}K`);
  } else if (plan.container !== 'source') {
    args.push(plan.formatIds.length === 2 ? '--merge-output-format' : '--remux-video', plan.container);
  }
  args.push('--', url);
  return args;
}
