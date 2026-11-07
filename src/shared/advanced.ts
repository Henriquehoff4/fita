import {
  AUDIO_LABEL,
  VIDEO_LABEL,
  audioContainers,
  audioPlan,
  containerLabel,
  defaultMp3Rate,
  mp3RatesFor,
  videoContainers,
  videoPlan,
} from './plan';
import { audioSources, audioStreams, videoStreams } from './presets';
import type { AudioCodec, Container, DownloadPlan, Stream, VideoCodec, VideoInfo } from './types';

export interface Option {
  value: string;
  label: string;
}

export interface AdvancedSelection {
  mode?: string;
  quality?: string;
  fps?: string;
  vcodec?: string;
  language?: string;
  acodec?: string;
  abr?: string;
  container?: string;
  mp3Bitrate?: string;
}

export interface AdvancedModel {
  modes: Option[];
  qualities: Option[];
  fps: Option[];
  vcodecs: Option[];
  languages: Option[];
  acodecs: Option[];
  abrs: Option[];
  containers: Option[];
  mp3Bitrates: Option[];
  embeddedAudio: string | null;
  noAudio: boolean;
  selection: Required<AdvancedSelection>;
  plan: DownloadPlan | null;
}

const V_ORDER: VideoCodec[] = ['h264', 'h265', 'vp9', 'av1', 'vp8', 'other', 'unknown'];
const A_ORDER: AudioCodec[] = ['aac', 'opus', 'mp3', 'vorbis', 'flac', 'ac3', 'other', 'unknown'];

const qualityKey = (s: Stream) => (s.quality ? String(s.quality) : 'original');
const fpsKey = (s: Stream) => (s.fps ? String(s.fps) : 'unknown');
const vcodecKey = (s: Stream) => `${s.vcodec ?? 'unknown'}${s.hdr ? '-hdr' : ''}`;
const langKey = (s: Stream) => s.language ?? 'default';
const abrKey = (s: Stream) => (s.abr ? String(Math.round(s.abr)) : 'original');

const uniq = <T,>(items: T[]) => [...new Set(items)];
const pick = (options: Option[], wanted: string | undefined) =>
  options.find((o) => o.value === wanted)?.value ?? options[0]?.value ?? '';

function vcodecLabel(key: string): string {
  const [codec, hdr] = key.split('-');
  return `${VIDEO_LABEL[codec as VideoCodec] ?? codec}${hdr ? ' HDR' : ''}`;
}

function languageLabel(code: string): string {
  if (code === 'default') return 'Padrão';
  try {
    const name = new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(code);
    return name ? name[0].toUpperCase() + name.slice(1) : code;
  } catch {
    return code;
  }
}

function bestVideoOf(streams: Stream[]): Stream | null {
  const separate = (stream: Stream) => (stream.kind === 'video' ? 1 : 0);
  return [...streams].sort((a, b) => Number(b.direct) - Number(a.direct) || separate(b) - separate(a) || (b.tbr ?? 0) - (a.tbr ?? 0))[0] ?? null;
}

function bestAudioOf(streams: Stream[]): Stream | null {
  return [...streams].sort((a, b) => Number(b.direct) - Number(a.direct) || (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0] ?? null;
}

export function buildAdvanced(info: VideoInfo, wanted: AdvancedSelection): AdvancedModel {
  const videos = videoStreams(info);
  const separateAudio = audioStreams(info);
  const sources = audioSources(info).filter((s) => s.acodec);

  const modes: Option[] = [];
  if (videos.length) modes.push({ value: 'video', label: 'Vídeo' });
  if (sources.length) modes.push({ value: 'audio', label: 'Só áudio' });
  const mode = pick(modes, wanted.mode) || 'video';

  const qualityValues = uniq(videos.map(qualityKey)).sort((a, b) => (Number(b) || 0) - (Number(a) || 0));
  const qualities = qualityValues.map((value) => ({ value, label: value === 'original' ? 'Original' : `${value}p` }));
  const quality = pick(qualities, wanted.quality);
  const atQuality = videos.filter((s) => qualityKey(s) === quality);

  const fpsValues = uniq(atQuality.map(fpsKey)).sort((a, b) => (Number(b) || 0) - (Number(a) || 0));
  const fpsOptions = fpsValues.filter((v) => v !== 'unknown').map((value) => ({ value, label: `${value} fps` }));
  const fps = fpsOptions.length ? pick(fpsOptions, wanted.fps) : 'unknown';
  const atFps = fpsOptions.length ? atQuality.filter((s) => fpsKey(s) === fps) : atQuality;

  const vcodecRank = (key: string) => V_ORDER.indexOf(key.split('-')[0] as VideoCodec) * 2 + (key.includes('hdr') ? 1 : 0);
  const vcodecs = uniq(atFps.map(vcodecKey))
    .sort((a, b) => vcodecRank(a) - vcodecRank(b))
    .map((value) => ({ value, label: vcodecLabel(value) }));
  const vcodec = pick(vcodecs, wanted.vcodec);
  const video = bestVideoOf(atFps.filter((s) => vcodecKey(s) === vcodec));

  const embeddedAudio = mode === 'video' && video?.kind === 'combined' ? (video.acodec ? AUDIO_LABEL[video.acodec] : null) : null;
  const needsAudioChoice = mode === 'audio' || video?.kind === 'video';
  const audioPool = mode === 'audio' ? sources : separateAudio;

  const languageValues = needsAudioChoice ? uniq(audioPool.map(langKey)) : [];
  const preferredLanguage = audioPool.length ? langKey([...audioPool].sort((a, b) => b.languageRank - a.languageRank)[0]) : undefined;
  const languages = languageValues.length > 1 ? languageValues.map((value) => ({ value, label: languageLabel(value) })) : [];
  const language = languages.length ? pick(languages, wanted.language ?? preferredLanguage) : languageValues[0] ?? 'default';
  const atLanguage = audioPool.filter((s) => langKey(s) === language);

  const prefersOpus = mode === 'video' && (video?.vcodec === 'vp9' || video?.vcodec === 'vp8');
  const acodecScore = (codec: AudioCodec) => (prefersOpus && codec === 'opus' ? -1 : A_ORDER.indexOf(codec));
  const acodecs = needsAudioChoice
    ? uniq(atLanguage.map((s) => s.acodec ?? ('unknown' as AudioCodec)))
        .sort((a, b) => acodecScore(a) - acodecScore(b))
        .map((value) => ({ value, label: AUDIO_LABEL[value] }))
    : [];
  const acodec = pick(acodecs, wanted.acodec);
  const atCodec = atLanguage.filter((s) => (s.acodec ?? 'unknown') === acodec);

  const abrs = needsAudioChoice
    ? uniq(atCodec.map(abrKey))
        .sort((a, b) => (Number(b) || 0) - (Number(a) || 0))
        .map((value) => ({ value, label: value === 'original' ? 'Original' : `${value} kbps` }))
    : [];
  const abr = pick(abrs, wanted.abr);
  const audio = needsAudioChoice ? bestAudioOf(atCodec.filter((s) => abrKey(s) === abr)) : null;

  const allowed: Container[] = mode === 'audio' ? (audio ? audioContainers(audio) : []) : video ? videoContainers(video, audio) : [];
  const containers = allowed.map((value) => ({ value, label: containerLabel(value, video?.ext) }));
  const container = pick(containers, wanted.container) as Container;

  const rates = mode === 'audio' && container === 'mp3' && audio ? mp3RatesFor(audio.abr) : [];
  const mp3Bitrates = [...rates].reverse().map((rate) => ({ value: String(rate), label: `${rate} kbps` }));
  const mp3Bitrate = pick(mp3Bitrates, wanted.mp3Bitrate ?? (audio ? String(defaultMp3Rate(audio.abr)) : undefined));

  let plan: DownloadPlan | null = null;
  if (mode === 'audio' && audio && container) {
    plan = audioPlan(audio, container, Number(mp3Bitrate) || defaultMp3Rate(audio.abr), info.duration);
  } else if (mode === 'video' && video && container) {
    plan = videoPlan(video, audio, container, info.duration);
  }

  return {
    modes,
    qualities: mode === 'video' ? qualities : [],
    fps: mode === 'video' ? fpsOptions : [],
    vcodecs: mode === 'video' ? vcodecs : [],
    languages,
    acodecs,
    abrs,
    containers,
    mp3Bitrates,
    embeddedAudio,
    noAudio: mode === 'video' && video?.kind === 'video' && separateAudio.length === 0,
    selection: { mode, quality, fps, vcodec, language, acodec, abr, container, mp3Bitrate },
    plan,
  };
}
