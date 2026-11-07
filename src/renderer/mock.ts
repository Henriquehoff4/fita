import type { AnalyzeResult, FitaApi, HistoryEntry, QueueItem, Settings, Stream, ToolsStatus, VideoInfo } from '../shared/types';
import { audioPlan, videoContainers, videoPlan } from '../shared/plan';

const poster = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'><rect width='160' height='90' fill='${a}'/><circle cx='118' cy='30' r='17' fill='${b}'/><path d='M0 90 50 44l32 28 24-18 54 36z' fill='#000' opacity='.55'/></svg>`)}`;

const video = (id: string, quality: number, fps: number, vcodec: Stream['vcodec'], ext: string, mb: number): Stream => ({
  id,
  kind: 'video',
  ext,
  quality,
  width: Math.round((quality * 16) / 9),
  height: quality,
  fps,
  vcodec,
  hdr: false,
  acodec: null,
  abr: null,
  tbr: (mb * 8000) / 754,
  size: mb * 1024 * 1024,
  sizeExact: true,
  language: null,
  languageRank: 0,
  direct: true,
});

const audio = (id: string, acodec: Stream['acodec'], abr: number, ext: string): Stream => ({
  id,
  kind: 'audio',
  ext,
  quality: null,
  width: null,
  height: null,
  fps: null,
  vcodec: null,
  hdr: false,
  acodec,
  abr,
  tbr: abr,
  size: Math.round((abr * 1000 * 754) / 8),
  sizeExact: true,
  language: null,
  languageRank: 0,
  direct: true,
});

const SAMPLE: VideoInfo = {
  url: 'https://www.youtube.com/watch?v=exemplo',
  id: 'exemplo',
  title: 'Como é feita uma bobina de filme 35 mm, do acetato à lata',
  thumbnail: poster('#6b4a2f', '#ffcf7a'),
  duration: 754,
  platform: 'YouTube',
  uploader: 'Museu da Imagem',
  fromPlaylist: false,
  streams: [
    video('315', 2160, 60, 'vp9', 'webm', 1890),
    video('401', 2160, 60, 'av1', 'mp4', 1420),
    video('299', 1080, 60, 'h264', 'mp4', 412),
    video('303', 1080, 60, 'vp9', 'webm', 298),
    video('137', 1080, 30, 'h264', 'mp4', 268),
    video('298', 720, 60, 'h264', 'mp4', 196),
    video('136', 720, 30, 'h264', 'mp4', 128),
    video('135', 480, 30, 'h264', 'mp4', 64),
    video('134', 360, 30, 'h264', 'mp4', 38),
    audio('251', 'opus', 160, 'webm'),
    audio('250', 'opus', 70, 'webm'),
    audio('140', 'aac', 129, 'm4a'),
    audio('139', 'aac', 49, 'm4a'),
  ],
};

const VERTICAL: VideoInfo = {
  url: 'https://www.tiktok.com/@revelando/video/1',
  id: '1',
  title: 'Revelando um rolo em casa em 40 segundos',
  thumbnail: poster('#23323a', '#ffb02e'),
  duration: 41,
  platform: 'TikTok',
  uploader: 'revelando',
  fromPlaylist: false,
  streams: [
    { ...video('h264_720', 720, 30, 'h264', 'mp4', 9), kind: 'combined', width: 720, height: 1280, acodec: 'aac', abr: 128 },
    { ...video('h265_1080', 1080, 30, 'h265', 'mp4', 11), kind: 'combined', width: 1080, height: 1920, acodec: 'aac', abr: 128 },
  ],
};

const plan1080 = videoPlan(SAMPLE.streams[4], SAMPLE.streams[11], videoContainers(SAMPLE.streams[4], SAMPLE.streams[11])[0], SAMPLE.duration);
const plan2160 = videoPlan(SAMPLE.streams[0], SAMPLE.streams[9], 'webm', SAMPLE.duration);
const planMp3 = audioPlan(SAMPLE.streams[9], 'mp3', 160, SAMPLE.duration);

const baseItem = (id: string, title: string, plan: QueueItem['plan']): QueueItem => ({
  id,
  url: SAMPLE.url,
  title,
  thumbnail: SAMPLE.thumbnail,
  platform: 'YouTube',
  plan,
  status: 'queued',
  segmentFractions: plan.segments.map(() => 0),
  fraction: 0,
  stage: 'Na fila',
  speed: null,
  eta: null,
  downloaded: null,
  total: null,
});

const QUEUE: QueueItem[] = [
  {
    ...baseItem('q1', 'Como é feita uma bobina de filme 35 mm, do acetato à lata', plan2160),
    status: 'downloading',
    segmentFractions: [0.46, 0],
    fraction: 0.43,
    stage: 'Baixando vídeo 2160p60',
    speed: 9.4 * 1024 * 1024,
    eta: 118,
    downloaded: 870 * 1024 * 1024,
    total: 2030 * 1024 * 1024,
  },
  { ...baseItem('q2', 'Revelando um rolo em casa em 40 segundos', planMp3) },
  {
    ...baseItem('q3', 'Entrevista completa com a montadora Vera Lins', plan1080),
    status: 'finalizing',
    segmentFractions: [1, 1],
    fraction: 0.97,
    stage: 'Juntando vídeo e áudio',
  },
  {
    ...baseItem('q4', 'Os últimos laboratórios de cinema da América do Sul', plan1080),
    status: 'done',
    segmentFractions: [1, 1],
    fraction: 1,
    stage: 'Concluído',
    total: 286 * 1024 * 1024,
    filePath: 'x',
  },
  {
    ...baseItem('q5', 'Bastidores restritos do festival', plan1080),
    status: 'error',
    stage: 'Falhou',
    error: {
      code: 'private',
      title: 'Este vídeo é privado',
      hint: 'Se a sua conta tem acesso, ative “Usar login do navegador” em Ajustes e tente de novo.',
      detail: 'ERROR: [youtube] abc: Private video. Sign in if you have been granted access',
    },
  },
];

const HISTORY: HistoryEntry[] = [
  ['Os últimos laboratórios de cinema da América do Sul', 'YouTube', plan1080.summary, 286, true],
  ['Revelando um rolo em casa em 40 segundos', 'TikTok', '1080p · H.265 + AAC · MP4', 11.2, true],
  ['Trilha completa do curta Sala Escura', 'YouTube', planMp3.summary, 15.1, false],
].map(([title, platform, summary, mb, exists], index) => ({
  id: `h${index}`,
  url: SAMPLE.url,
  title: title as string,
  thumbnail: index === 2 ? null : poster('#3c3a2f', '#ffb02e'),
  platform: platform as string,
  summary: summary as string,
  size: (mb as number) * 1024 * 1024,
  filePath: 'x',
  finishedAt: new Date(Date.now() - index * 26 * 3600 * 1000).toISOString(),
  exists: exists as boolean,
}));

export function installMock(): void {
  const params = new URLSearchParams(location.search);
  const worst = params.has('worst');
  let queue = params.has('emptyqueue') ? [] : worst ? QUEUE.map((item) => ({ ...item, title: 'Sem_espacos_'.repeat(20) })) : [...QUEUE];
  let settings: Settings = {
    folder: worst
      ? 'D:\\Arquivos do trabalho\\Projetos de 2026\\Cliente com nome muito comprido mesmo\\Material bruto\\Vídeos baixados da internet\\Semana 44'
      : 'C:\\Users\\voce\\Videos\\Fita',
    concurrency: 2,
    cookies: 'none',
  };
  const longTitle = `Tutorial_definitivo_completo_sem_espacos_para_quebrar_a_linha_${'muito'.repeat(12)} 日本語のタイトルとعنوان عربي e mais um título enorme que nunca termina`;
  const tools: ToolsStatus = {
    ytdlp: { found: true, version: '2026.10.26', managed: true },
    ffmpeg: { found: true, version: '9.0.2', managed: false },
    deno: { found: true, version: '2.6.1', managed: false },
    canInstallFfmpeg: true,
  };
  const listeners = new Set<(items: QueueItem[]) => void>();
  const emit = () => listeners.forEach((listener) => listener([...queue]));

  const analyze = async (url: string): Promise<AnalyzeResult> => {
    await new Promise((resolve) => setTimeout(resolve, url.includes('lento') ? 60000 : 500));
    if (url.includes('privado')) return { ok: false, error: QUEUE[4].error! };
    if (url.includes('tiktok')) return { ok: true, info: { ...VERTICAL, url } };
    if (worst) {
      return { ok: true, info: { ...SAMPLE, url, title: longTitle, uploader: 'Canal_com_nome_absurdamente_comprido_'.repeat(4), thumbnail: null, duration: null, fromPlaylist: true } };
    }
    return { ok: true, info: { ...SAMPLE, url } };
  };

  const api: FitaApi = {
    readClipboard: async () => params.get('clip') ?? SAMPLE.url,
    analyze,
    enqueue: async (request) => {
      queue = [{ ...baseItem(crypto.randomUUID(), request.title, request.plan) }, ...queue];
      emit();
      return { ok: true };
    },
    cancel: async () => undefined,
    retry: async () => undefined,
    dismiss: async (id) => {
      queue = queue.filter((item) => item.id !== id);
      emit();
    },
    clearFinished: async () => {
      queue = queue.filter((item) => !['done', 'error', 'canceled'].includes(item.status));
      emit();
    },
    getQueue: async () => queue,
    onQueue: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openQueueFile: async () => true,
    showQueueFile: async () => true,
    getHistory: async () => (params.has('emptyhistory') ? [] : HISTORY),
    openHistoryFile: async () => true,
    showHistoryFile: async () => true,
    removeHistory: async (id) => HISTORY.filter((entry) => entry.id !== id),
    clearHistory: async () => [],
    getSettings: async () => settings,
    updateSettings: async (patch) => (settings = { ...settings, ...patch }),
    chooseFolder: async () => settings,
    openFolder: async () => undefined,
    getTools: async () => tools,
    updateYtdlp: async () => ({ ok: true, updated: false, version: tools.ytdlp.version! }),
    installFfmpeg: async () => ({ ok: true, updated: true, version: '9.0.2' }),
    onInstallProgress: () => () => undefined,
  };
  window.fita = api;
}
