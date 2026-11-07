import { audioPlan, defaultMp3Rate, videoContainers, videoPlan } from './plan';
import type { DownloadPlan, Stream, VideoCodec, VideoInfo } from './types';

export type PresetId = 'best' | 'high' | 'medium' | 'low' | 'mp3';

export interface Preset {
  id: PresetId;
  name: string;
  plan: DownloadPlan | null;
  unavailable?: string;
}

const NAMES: Record<PresetId, string> = {
  best: 'Melhor disponível',
  high: 'Alta qualidade',
  medium: 'Média qualidade',
  low: 'Baixa qualidade',
  mp3: 'Somente áudio (MP3)',
};

const BEST_RANK: Record<VideoCodec, number> = { av1: 4, vp9: 4, h265: 3, h264: 2, vp8: 1, other: 0, unknown: 0 };
const COMPAT_RANK: Record<VideoCodec, number> = { h264: 5, h265: 3, vp9: 2, av1: 2, vp8: 1, other: 0, unknown: 1 };

const by =
  <T,>(...keys: ((item: T) => number)[]) =>
  (a: T, b: T) => {
    for (const key of keys) {
      const diff = key(b) - key(a);
      if (diff) return diff;
    }
    return 0;
  };

export const videoStreams = (info: VideoInfo) => info.streams.filter((s) => s.kind !== 'audio');
export const audioStreams = (info: VideoInfo) => info.streams.filter((s) => s.kind === 'audio');

export function primaryAudio(info: VideoInfo): Stream[] {
  const audio = audioStreams(info);
  if (!audio.length) return [];
  const top = Math.max(...audio.map((s) => s.languageRank));
  return audio.filter((s) => s.languageRank === top);
}

export function audioSources(info: VideoInfo): Stream[] {
  const separate = primaryAudio(info);
  return separate.length ? separate : info.streams.filter((s) => s.kind === 'combined');
}

function pickBest(streams: Stream[]): Stream | null {
  return (
    [...streams].sort(
      by<Stream>(
        (s) => s.quality ?? 0,
        (s) => s.fps ?? 0,
        (s) => (s.hdr ? 0 : 1),
        (s) => (s.direct ? 1 : 0),
        (s) => BEST_RANK[s.vcodec ?? 'unknown'],
        (s) => (s.kind === 'video' ? 1 : 0),
        (s) => s.tbr ?? 0,
      ),
    )[0] ?? null
  );
}

function pickCompatible(streams: Stream[]): Stream | null {
  return (
    [...streams].sort(
      by<Stream>(
        (s) => s.quality ?? 0,
        (s) => COMPAT_RANK[s.vcodec ?? 'unknown'],
        (s) => (s.hdr ? 0 : 1),
        (s) => s.fps ?? 0,
        (s) => (s.direct ? 1 : 0),
        (s) => (s.kind === 'video' ? 1 : 0),
        (s) => s.tbr ?? 0,
      ),
    )[0] ?? null
  );
}

type Tier = 'best' | 'high' | 'medium' | 'low';

function pickAudioFor(info: VideoInfo, video: Stream, tier: Tier): Stream | null {
  if (video.kind === 'combined') return null;
  const pool = primaryAudio(info);
  if (!pool.length) return null;
  const wantsOpus = video.vcodec === 'vp9' || video.vcodec === 'vp8';
  const preferred = pool.filter((s) => (wantsOpus ? s.acodec === 'opus' : s.acodec === 'aac'));
  const candidates = preferred.length ? preferred : pool;
  const sorted = [...candidates].sort(by<Stream>((s) => (s.direct ? 1 : 0), (s) => s.abr ?? s.tbr ?? 0));
  if (tier === 'best' || tier === 'high') return sorted[0];
  if (tier === 'low') return sorted[sorted.length - 1];
  return sorted.find((s) => (s.abr ?? 0) <= 135) ?? sorted[sorted.length - 1];
}

function buildVideo(info: VideoInfo, video: Stream, tier: Tier): DownloadPlan {
  const audio = pickAudioFor(info, video, tier);
  return videoPlan(video, audio, videoContainers(video, audio)[0], info.duration);
}

const CAPS = { high: 1080, medium: 720, low: 480 } as const;

export function buildPresets(info: VideoInfo): Preset[] {
  const videos = videoStreams(info);
  const presets: Preset[] = [];

  const best = pickBest(videos);
  const bestPlan = best ? buildVideo(info, best, 'best') : null;
  presets.push({ id: 'best', name: NAMES.best, plan: bestPlan, unavailable: best ? undefined : 'Este link só tem áudio' });

  const measured = videos.some((s) => s.quality !== null);
  const byRate = measured ? [] : [...videos].sort(by<Stream>((s) => s.tbr ?? 0));
  const taken: { name: string; plan: DownloadPlan }[] = bestPlan ? [{ name: NAMES.best, plan: bestPlan }] : [];
  let ceiling = Infinity;

  (['high', 'medium', 'low'] as const).forEach((tier, index) => {
    let chosen: Stream | null = null;
    if (measured) {
      chosen = pickCompatible(videos.filter((s) => s.quality !== null && s.quality <= CAPS[tier] && s.quality < ceiling));
      if (chosen) ceiling = chosen.quality!;
    } else if (byRate.length > 1) {
      chosen = byRate[index + 1] ?? null;
    }

    if (!chosen) {
      presets.push({
        id: tier,
        name: NAMES[tier],
        plan: null,
        unavailable: videos.length ? 'Este vídeo não tem esta qualidade' : 'Este link só tem áudio',
      });
      return;
    }
    const plan = buildVideo(info, chosen, tier);
    const twin = taken.find((other) => other.plan.formatIds[0] === plan.formatIds[0]);
    if (twin) {
      presets.push({ id: tier, name: NAMES[tier], plan: null, unavailable: `Igual a ${twin.name}` });
      return;
    }
    taken.push({ name: NAMES[tier], plan });
    presets.push({ id: tier, name: NAMES[tier], plan });
  });

  const source = [...audioSources(info)].filter((s) => s.acodec).sort(by<Stream>((s) => s.abr ?? 0, (s) => s.tbr ?? 0))[0];
  presets.push(
    source
      ? { id: 'mp3', name: NAMES.mp3, plan: audioPlan(source, 'mp3', defaultMp3Rate(source.abr), info.duration) }
      : { id: 'mp3', name: NAMES.mp3, plan: null, unavailable: 'Este vídeo não tem áudio' },
  );
  return presets;
}
