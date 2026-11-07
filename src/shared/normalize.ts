import type { AudioCodec, Stream, VideoCodec, VideoInfo } from './types';

const SAFE_ID = /^[\w.~-]{1,120}$/;

const PLATFORMS: [RegExp, string][] = [
  [/^youtube/i, 'YouTube'],
  [/^tiktok|^douyin/i, 'TikTok'],
  [/^instagram/i, 'Instagram'],
  [/^(twitter|x$)/i, 'X'],
  [/^facebook/i, 'Facebook'],
  [/^reddit/i, 'Reddit'],
  [/^vimeo/i, 'Vimeo'],
  [/^twitch/i, 'Twitch'],
  [/^kwai/i, 'Kwai'],
  [/^pinterest/i, 'Pinterest'],
  [/^dailymotion/i, 'Dailymotion'],
  [/^soundcloud/i, 'SoundCloud'],
  [/^linkedin/i, 'LinkedIn'],
  [/^threads/i, 'Threads'],
  [/^bluesky/i, 'Bluesky'],
  [/^snapchat/i, 'Snapchat'],
  [/^bilibili/i, 'Bilibili'],
  [/^kick/i, 'Kick'],
  [/^rumble/i, 'Rumble'],
  [/^generic/i, 'Site'],
];

export interface RawFormat {
  format_id?: unknown;
  ext?: unknown;
  vcodec?: unknown;
  acodec?: unknown;
  video_ext?: unknown;
  width?: unknown;
  height?: unknown;
  fps?: unknown;
  tbr?: unknown;
  abr?: unknown;
  filesize?: unknown;
  filesize_approx?: unknown;
  language?: unknown;
  language_preference?: unknown;
  dynamic_range?: unknown;
  protocol?: unknown;
  has_drm?: unknown;
  format_note?: unknown;
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export function videoCodecOf(raw: string | null): VideoCodec {
  if (!raw) return 'unknown';
  const value = raw.toLowerCase();
  if (/^(avc|h\.?264)/.test(value)) return 'h264';
  if (/^(hev|hvc|h\.?265|bytevc1)/.test(value)) return 'h265';
  if (/^(av01|av1)/.test(value)) return 'av1';
  if (/^vp0?9/.test(value)) return 'vp9';
  if (/^vp0?8/.test(value)) return 'vp8';
  return 'other';
}

export function audioCodecOf(raw: string | null): AudioCodec {
  if (!raw) return 'unknown';
  const value = raw.toLowerCase();
  if (/^(mp3|mp4a\.6b|mp4a\.69)/.test(value)) return 'mp3';
  if (/^(mp4a|aac)/.test(value)) return 'aac';
  if (value.startsWith('opus')) return 'opus';
  if (value.startsWith('vorbis')) return 'vorbis';
  if (value.startsWith('flac')) return 'flac';
  if (/^(ac-?3|ec-?3|eac3)/.test(value)) return 'ac3';
  return 'other';
}

export function normalizeFormat(format: RawFormat, hasSeparateAudio = false): Stream | null {
  const id = str(format.format_id);
  if (!id || !SAFE_ID.test(id) || format.has_drm === true) return null;
  const ext = str(format.ext) ?? 'mp4';
  if (ext === 'mhtml' || /storyboard/i.test(String(format.format_note ?? ''))) return null;

  const rawV = str(format.vcodec);
  const rawA = str(format.acodec);
  const videoExt = str(format.video_ext);
  const width = num(format.width);
  const height = num(format.height);

  const hasVideo = rawV ? rawV !== 'none' : videoExt ? videoExt !== 'none' : true;
  const hasAudio = rawA ? rawA !== 'none' : !(hasVideo && rawV && hasSeparateAudio);
  if (!hasVideo && !hasAudio) return null;

  const size = num(format.filesize);
  const approx = num(format.filesize_approx);
  const quality = hasVideo && (width || height) ? Math.min(width ?? height!, height ?? width!) : null;
  const fps = num(format.fps);

  return {
    id,
    kind: hasVideo && hasAudio ? 'combined' : hasVideo ? 'video' : 'audio',
    ext,
    quality,
    width,
    height,
    fps: hasVideo && fps ? Math.round(fps) : null,
    vcodec: hasVideo ? videoCodecOf(rawV === 'none' ? null : rawV) : null,
    hdr: hasVideo && /hdr|hlg|dv/i.test(String(format.dynamic_range ?? '')),
    acodec: hasAudio ? audioCodecOf(rawA === 'none' ? null : rawA) : null,
    abr: hasAudio ? num(format.abr) : null,
    tbr: num(format.tbr),
    size: size ?? approx,
    sizeExact: size !== null,
    language: str(format.language),
    languageRank: typeof format.language_preference === 'number' ? format.language_preference : 0,
    direct: /^https?$/.test(String(format.protocol ?? 'https')),
  };
}

function cleanAudio(streams: Stream[]): Stream[] {
  const audio = streams.filter((s) => s.kind === 'audio');
  const known = audio.filter((s) => s.acodec !== 'unknown' || s.abr !== null);
  const pool = known.length ? known : audio;
  const plain = pool.filter((s) => !/-drc$/.test(s.id));
  const keep = new Set((plain.length ? plain : pool).map((s) => s.id));
  return streams.filter((s) => s.kind !== 'audio' || keep.has(s.id));
}

export function platformOf(extractorKey: unknown): string {
  const key = str(extractorKey) ?? 'Generic';
  const match = PLATFORMS.find(([pattern]) => pattern.test(key));
  return match ? match[1] : key.replace(/(IE|Video|Post|Clip)$/, '') || 'Site';
}

function thumbnailOf(raw: Record<string, unknown>): string | null {
  const direct = str(raw.thumbnail);
  if (direct?.startsWith('https://')) return direct;
  const list = Array.isArray(raw.thumbnails) ? raw.thumbnails : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const url = str((list[index] as { url?: unknown })?.url);
    if (url?.startsWith('https://')) return url;
  }
  return null;
}

export class NormalizeError extends Error {
  constructor(public code: 'live' | 'no-formats') {
    super(code);
  }
}

export function normalizeInfo(raw: Record<string, unknown>, url: string): VideoInfo {
  let entry = raw;
  let fromPlaylist = false;
  if (raw._type === 'playlist' || Array.isArray(raw.entries)) {
    const first = (raw.entries as unknown[] | undefined)?.find(Boolean) as Record<string, unknown> | undefined;
    if (!first) throw new NormalizeError('no-formats');
    entry = first;
    fromPlaylist = true;
  }
  if (entry.is_live === true) throw new NormalizeError('live');

  const rawFormats = Array.isArray(entry.formats) ? (entry.formats as RawFormat[]) : [];
  const fallback =
    rawFormats.length === 0 && str(entry.url) ? [{ ...(entry as RawFormat), format_id: str(entry.format_id) ?? 'best' }] : [];
  const all = [...rawFormats, ...fallback];
  const hasSeparateAudio = all.some((format) => format.vcodec === 'none');
  const streams = cleanAudio(all.map((f) => normalizeFormat(f, hasSeparateAudio)).filter((s): s is Stream => s !== null));
  if (streams.length === 0) throw new NormalizeError('no-formats');

  return {
    url,
    id: str(entry.id) ?? '',
    title: str(entry.title) ?? str(entry.fulltitle) ?? 'Vídeo sem título',
    thumbnail: thumbnailOf(entry),
    duration: num(entry.duration),
    platform: platformOf(entry.extractor_key ?? raw.extractor_key),
    uploader: str(entry.uploader) ?? str(entry.channel) ?? str(entry.creator),
    fromPlaylist,
    streams,
  };
}
