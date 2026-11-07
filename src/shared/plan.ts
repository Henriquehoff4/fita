import type { AudioCodec, Container, DownloadPlan, PlanSegment, Stream, VideoCodec } from './types';

export const VIDEO_LABEL: Record<VideoCodec, string> = {
  h264: 'H.264',
  h265: 'H.265',
  av1: 'AV1',
  vp9: 'VP9',
  vp8: 'VP8',
  other: 'Outro',
  unknown: 'Original',
};

export const AUDIO_LABEL: Record<AudioCodec, string> = {
  aac: 'AAC',
  opus: 'Opus',
  mp3: 'MP3',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  ac3: 'AC-3',
  other: 'Outro',
  unknown: 'Original',
};

const MP4_VIDEO: VideoCodec[] = ['h264', 'h265', 'av1', 'vp9'];
const MP4_AUDIO: AudioCodec[] = ['aac', 'mp3', 'opus', 'ac3'];
const WEBM_VIDEO: VideoCodec[] = ['vp8', 'vp9', 'av1'];
const WEBM_AUDIO: AudioCodec[] = ['opus', 'vorbis'];
const MP3_RATES = [64, 96, 128, 160, 192, 256, 320];

export function streamBytes(stream: Stream, duration: number | null): number | null {
  if (stream.size) return stream.size;
  const rate = stream.tbr ?? (stream.kind === 'audio' ? stream.abr : null);
  return rate && duration ? Math.round((rate * 1000 * duration) / 8) : null;
}

export function mp3RatesFor(sourceAbr: number | null): number[] {
  if (!sourceAbr) return MP3_RATES.filter((rate) => rate <= 192);
  const allowed = MP3_RATES.filter((rate) => rate <= sourceAbr * 1.05);
  return allowed.length ? allowed : [MP3_RATES[0]];
}

export function defaultMp3Rate(sourceAbr: number | null): number {
  const allowed = mp3RatesFor(sourceAbr).filter((rate) => rate <= 192);
  return allowed[allowed.length - 1] ?? MP3_RATES[0];
}

export function videoContainers(video: Stream, audio: Stream | null): Container[] {
  const v = video.vcodec ?? 'unknown';
  const a = audio?.acodec ?? video.acodec;
  const ext = audio ? null : video.ext;
  const audioIn = (list: AudioCodec[], exts: string[]) =>
    !a || list.includes(a) || (a === 'unknown' && !!ext && exts.includes(ext));
  const mp4 = (MP4_VIDEO.includes(v) || (v === 'unknown' && ext === 'mp4')) && audioIn(MP4_AUDIO, ['mp4']);
  const webm = (WEBM_VIDEO.includes(v) || (v === 'unknown' && ext === 'webm')) && audioIn(WEBM_AUDIO, ['webm']);
  const friendly = mp4 && v !== 'vp9' && a !== 'opus';

  const list: Container[] = [];
  if (friendly) list.push('mp4');
  if (webm) list.push('webm');
  if (mp4 && !friendly) list.push('mp4');
  list.push('mkv');
  if (!audio && !['mp4', 'webm', 'mkv'].includes(video.ext)) list.unshift('source');
  return list;
}

export function audioContainers(source: Stream): Container[] {
  const list: Container[] = ['mp3'];
  if (source.acodec === 'aac') list.unshift('m4a');
  if (source.acodec === 'opus') list.unshift('opus');
  return list;
}

export const containerLabel = (container: Container, ext?: string): string =>
  container === 'source' ? (ext ?? 'original').toUpperCase() : container === 'webm' ? 'WebM' : container.toUpperCase();

export function qualityLabel(stream: Stream): string {
  if (!stream.quality) return 'Original';
  const fps = stream.fps && stream.fps > 30 ? String(stream.fps) : '';
  return `${stream.quality}p${fps}`;
}

function sumSize(streams: Stream[], duration: number | null) {
  let size = 0;
  let exact = true;
  for (const stream of streams) {
    const bytes = streamBytes(stream, duration);
    if (bytes === null) return { size: null, exact: false };
    size += bytes;
    exact = exact && stream.sizeExact;
  }
  return { size, exact };
}

function videoTag(quality: string, video: Stream, audio: Stream | null): string {
  const parts = [quality === 'Original' ? 'original' : quality];
  if (video.vcodec && video.vcodec !== 'unknown') parts.push(video.vcodec + (video.hdr ? '-hdr' : ''));
  if (audio?.acodec && audio.acodec !== 'unknown') parts.push(audio.acodec + (audio.abr ? String(Math.round(audio.abr)) : ''));
  return parts.join('-');
}

export function videoPlan(video: Stream, audio: Stream | null, container: Container, duration: number | null): DownloadPlan {
  const useAudio = video.kind === 'combined' ? null : audio;
  const quality = qualityLabel(video);
  const { size, exact } = sumSize(useAudio ? [video, useAudio] : [video], duration);
  const segments: PlanSegment[] = [
    { key: video.kind === 'combined' ? 'both' : 'video', label: `vídeo ${quality}`, formatId: video.id, bytes: streamBytes(video, duration) },
  ];
  if (useAudio) segments.push({ key: 'audio', label: 'áudio', formatId: useAudio.id, bytes: streamBytes(useAudio, duration) });

  const effectiveAudio = useAudio?.acodec ?? video.acodec;
  const codecs = [VIDEO_LABEL[video.vcodec ?? 'unknown'], effectiveAudio ? AUDIO_LABEL[effectiveAudio] : 'sem áudio'].join(' + ');

  return {
    mode: 'video',
    formatIds: useAudio ? [video.id, useAudio.id] : [video.id],
    container,
    tag: videoTag(quality, video, useAudio),
    summary: `${quality} · ${codecs} · ${containerLabel(container, video.ext)}`,
    size,
    sizeExact: exact,
    segments,
    finalize: !!useAudio || (container !== 'source' && container !== video.ext),
  };
}

export function audioPlan(source: Stream, container: Container, mp3Bitrate: number, duration: number | null): DownloadPlan {
  const converts = container === 'mp3' && source.acodec !== 'mp3';
  const bytes = streamBytes(source, duration);
  const size = container === 'mp3' && duration ? Math.round((mp3Bitrate * 1000 * duration) / 8) : bytes;
  const rate = container === 'mp3' ? mp3Bitrate : source.abr ? Math.round(source.abr) : null;
  return {
    mode: 'audio',
    formatIds: [source.id],
    container,
    mp3Bitrate: container === 'mp3' ? mp3Bitrate : undefined,
    tag: rate ? `${rate}k` : 'audio',
    summary: [
      containerLabel(container),
      rate ? `${rate} kbps` : null,
      converts ? `convertido de ${AUDIO_LABEL[source.acodec ?? 'unknown']}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    size,
    sizeExact: false,
    segments: [{ key: 'audio', label: 'áudio', formatId: source.id, bytes }],
    finalize: true,
  };
}
