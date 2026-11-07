import { describe, expect, it } from 'vitest';
import { buildAdvanced } from '../src/shared/advanced';
import { analyzeArgs, downloadArgs, isValidPlan } from '../src/shared/args';
import { formatBytes, formatDuration, formatEta, versionAgeDays } from '../src/shared/display';
import { classifyError } from '../src/shared/errors';
import { NormalizeError, normalizeInfo, platformOf, type RawFormat } from '../src/shared/normalize';
import { videoContainers } from '../src/shared/plan';
import { buildPresets } from '../src/shared/presets';
import { createProgressTracker } from '../src/shared/progress';
import { extractUrl, isHttpUrl } from '../src/shared/url';

const v = (id: string, height: number, vcodec: string, extra: RawFormat = {}): RawFormat => ({
  format_id: id,
  ext: vcodec.startsWith('avc') ? 'mp4' : 'webm',
  vcodec,
  acodec: 'none',
  width: Math.round((height * 16) / 9),
  height,
  fps: 30,
  tbr: height,
  filesize: height * 100000,
  protocol: 'https',
  ...extra,
});
const a = (id: string, acodec: string, abr: number, extra: RawFormat = {}): RawFormat => ({
  format_id: id,
  ext: acodec === 'opus' ? 'webm' : 'm4a',
  vcodec: 'none',
  acodec,
  abr,
  tbr: abr,
  filesize: abr * 10000,
  protocol: 'https',
  ...extra,
});

const youtube = (formats: RawFormat[], extra: Record<string, unknown> = {}) =>
  normalizeInfo({ id: 'x', title: 'T', duration: 100, extractor_key: 'Youtube', formats, ...extra }, 'https://a.com/v');

const FULL = [
  v('315', 2160, 'vp9', { fps: 60 }),
  v('299', 1080, 'avc1.640028', { fps: 60 }),
  v('303', 1080, 'vp9', { fps: 60 }),
  v('137', 1080, 'avc1.640028'),
  v('136', 720, 'avc1.4d401f'),
  v('135', 480, 'avc1.4d401e'),
  v('134', 360, 'avc1.4d401e'),
  a('251', 'opus', 160),
  a('140', 'mp4a.40.2', 129),
  a('139', 'mp4a.40.5', 49),
];

describe('normalização', () => {
  it('lê o formato combinado real do YouTube (audio_ext none com acodec)', () => {
    const info = youtube([{ format_id: '18', ext: 'mp4', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', audio_ext: 'none', video_ext: 'mp4', width: 320, height: 240, tbr: 266 } as RawFormat]);
    expect(info.streams[0].kind).toBe('combined');
    expect(info.streams[0].acodec).toBe('aac');
  });

  it('descarta storyboards, DRM, faixas -drc e áudio HLS sem informação', () => {
    const info = youtube([
      { format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none' },
      v('drm', 1080, 'vp9', { has_drm: true }),
      a('140', 'mp4a.40.2', 129),
      a('140-drc', 'mp4a.40.2', 129),
      { format_id: '233', ext: 'mp4', vcodec: 'none', protocol: 'm3u8_native' },
      v('136', 720, 'avc1.4d401f'),
    ]);
    expect(info.streams.map((s) => s.id).sort()).toEqual(['136', '140']);
  });

  it('usa o lado menor como qualidade em vídeo vertical', () => {
    const info = youtube([{ format_id: 'p', ext: 'mp4', vcodec: 'h264', acodec: 'aac', width: 1080, height: 1920 }]);
    expect(info.streams[0].quality).toBe(1080);
  });

  it('trata formato sem codecs como vídeo com áudio', () => {
    const info = youtube([{ format_id: 'x', ext: 'mp4', video_ext: 'mp4', width: 640, height: 360 } as RawFormat]);
    expect(info.streams[0].kind).toBe('combined');
  });

  it('reconhece o H.265 do TikTok (bytevc1)', () => {
    const info = youtube([{ format_id: 'b', ext: 'mp4', vcodec: 'bytevc1', acodec: 'aac', width: 720, height: 1280 }]);
    expect(info.streams[0].vcodec).toBe('h265');
  });

  it('rejeita transmissão ao vivo e link sem formatos', () => {
    expect(() => youtube(FULL, { is_live: true })).toThrow(NormalizeError);
    expect(() => normalizeInfo({ _type: 'playlist', entries: [] }, 'https://a.com')).toThrow(NormalizeError);
  });

  it('pega o primeiro item de uma playlist e avisa', () => {
    const info = normalizeInfo({ _type: 'playlist', extractor_key: 'Instagram', entries: [{ id: '1', title: 'A', formats: FULL }] }, 'https://a.com');
    expect(info.fromPlaylist).toBe(true);
    expect(info.platform).toBe('Instagram');
  });

  it('dá nome às plataformas e não quebra com extrator desconhecido', () => {
    expect(platformOf('YoutubeTab')).toBe('YouTube');
    expect(platformOf('TikTokVM')).toBe('TikTok');
    expect(platformOf('Twitter')).toBe('X');
    expect(platformOf('Xiaohongshu')).toBe('Xiaohongshu');
  });
});

describe('presets', () => {
  it('monta os cinco presets sem passar do original', () => {
    const presets = buildPresets(youtube(FULL));
    const by = Object.fromEntries(presets.map((p) => [p.id, p]));
    expect(by.best.plan?.formatIds).toEqual(['315', '251']);
    expect(by.best.plan?.container).toBe('webm');
    expect(by.high.plan?.formatIds[0]).toBe('299');
    expect(by.high.plan?.container).toBe('mp4');
    expect(by.medium.plan?.formatIds[0]).toBe('136');
    expect(by.low.plan?.formatIds[0]).toBe('135');
    expect(by.mp3.plan?.container).toBe('mp3');
    expect(by.mp3.plan?.mp3Bitrate).toBe(160);
  });

  it('soma vídeo e áudio no tamanho estimado', () => {
    const presets = buildPresets(youtube(FULL));
    expect(presets[0].plan?.size).toBe(2160 * 100000 + 160 * 10000);
  });

  it('marca como indisponível o que o vídeo não tem', () => {
    const presets = buildPresets(youtube([v('136', 720, 'avc1.4d401f'), a('140', 'mp4a.40.2', 129)]));
    const by = Object.fromEntries(presets.map((p) => [p.id, p]));
    expect(by.high.plan).toBeNull();
    expect(by.high.unavailable).toMatch(/Igual/);
    expect(by.medium.plan).toBeNull();
    expect(by.low.plan).toBeNull();
    expect(by.best.plan?.formatIds).toEqual(['136', '140']);
  });

  it('funciona com formato único combinado, como TikTok e Instagram', () => {
    const info = normalizeInfo(
      { id: '1', title: 'A', extractor_key: 'TikTok', duration: 40, formats: [{ format_id: 'h264', ext: 'mp4', vcodec: 'h264', acodec: 'aac', width: 720, height: 1280, tbr: 1500 }] },
      'https://t.co/x',
    );
    const presets = buildPresets(info);
    expect(presets[0].plan?.formatIds).toEqual(['h264']);
    expect(presets[0].plan?.finalize).toBe(false);
    expect(presets[4].plan?.formatIds).toEqual(['h264']);
    expect(presets[0].plan?.size).toBe(7500000);
  });

  it('link só de áudio oferece só o MP3', () => {
    const presets = buildPresets(normalizeInfo({ id: '1', title: 'A', extractor_key: 'Soundcloud', duration: 10, formats: [a('http', 'mp3', 128)] }, 'https://s.co/x'));
    expect(presets.filter((p) => p.plan).map((p) => p.id)).toEqual(['mp3']);
  });

  it('nunca propõe MP3 acima do áudio de origem', () => {
    const presets = buildPresets(youtube([v('136', 720, 'avc1.4d401f'), a('139', 'mp4a.40.5', 49)]));
    expect(presets.find((p) => p.id === 'mp3')?.plan?.mp3Bitrate).toBe(64);
  });
});

describe('modo avançado', () => {
  const info = youtube(FULL);

  it('só oferece resoluções, fps e codecs que existem', () => {
    const model = buildAdvanced(info, {});
    expect(model.qualities.map((o) => o.value)).toEqual(['2160', '1080', '720', '480', '360']);
    const at1080 = buildAdvanced(info, { quality: '1080' });
    expect(at1080.fps.map((o) => o.value)).toEqual(['60', '30']);
    expect(at1080.vcodecs.map((o) => o.value)).toEqual(['h264', 'vp9']);
    const at30 = buildAdvanced(info, { quality: '1080', fps: '30' });
    expect(at30.vcodecs.map((o) => o.value)).toEqual(['h264']);
  });

  it('corrige seleção que deixou de existir ao trocar a resolução', () => {
    const model = buildAdvanced(info, { quality: '720', fps: '60', vcodec: 'vp9' });
    expect(model.selection.fps).toBe('30');
    expect(model.selection.vcodec).toBe('h264');
    expect(model.plan?.formatIds[0]).toBe('136');
  });

  it('oferece só contêineres compatíveis', () => {
    const webm = buildAdvanced(info, { quality: '2160', acodec: 'opus' });
    expect(webm.containers.map((o) => o.value)).toEqual(['webm', 'mp4', 'mkv']);
    const h264 = buildAdvanced(info, { quality: '720', acodec: 'aac' });
    expect(h264.containers.map((o) => o.value)).toEqual(['mp4', 'mkv']);
  });

  it('modo áudio oferece M4A só com fonte AAC e limita o bitrate do MP3', () => {
    const aac = buildAdvanced(info, { mode: 'audio', acodec: 'aac', abr: '129' });
    expect(aac.containers.map((o) => o.value)).toEqual(['m4a', 'mp3']);
    const opus = buildAdvanced(info, { mode: 'audio', acodec: 'opus', container: 'mp3' });
    expect(opus.mp3Bitrates.map((o) => o.value)).toEqual(['160', '128', '96', '64']);
    expect(opus.plan?.mp3Bitrate).toBe(160);
  });

  it('formato combinado trava o áudio', () => {
    const tiktok = normalizeInfo({ id: '1', title: 'A', extractor_key: 'TikTok', formats: [{ format_id: 'p', ext: 'mp4', vcodec: 'h264', acodec: 'aac', width: 720, height: 1280 }] }, 'https://t.co/x');
    const model = buildAdvanced(tiktok, {});
    expect(model.embeddedAudio).toBe('AAC');
    expect(model.acodecs).toEqual([]);
    expect(model.plan?.formatIds).toEqual(['p']);
  });

  it('propriedade: toda combinação oferecida gera um plano com formatos reais', () => {
    const ids = new Set(info.streams.map((s) => s.id));
    for (const quality of ['2160', '1080', '720', '480', '360']) {
      for (const fps of ['60', '30']) {
        for (const acodec of ['opus', 'aac']) {
          const model = buildAdvanced(info, { quality, fps, acodec });
          expect(model.plan).not.toBeNull();
          model.plan!.formatIds.forEach((id) => expect(ids.has(id)).toBe(true));
          expect(isValidPlan(model.plan)).toBe(true);
          expect(model.containers.map((o) => o.value)).toContain(model.plan!.container);
        }
      }
    }
  });

  it('mostra idioma quando há mais de um e escolhe o original', () => {
    const multi = youtube([v('136', 720, 'avc1.4d401f'), a('140-pt', 'mp4a.40.2', 129, { language: 'pt', language_preference: -1 }), a('140-en', 'mp4a.40.2', 129, { language: 'en', language_preference: 10 })]);
    const model = buildAdvanced(multi, {});
    expect(model.languages.length).toBe(2);
    expect(model.selection.language).toBe('en');
    expect(buildPresets(multi)[0].plan?.formatIds[1]).toBe('140-en');
  });
});

describe('contêineres', () => {
  it('formato de origem incomum aparece como opção original', () => {
    const info = youtube([{ format_id: 'f', ext: 'flv', vcodec: 'h263', acodec: 'mp3', width: 320, height: 240 }]);
    expect(videoContainers(info.streams[0], null)[0]).toBe('source');
  });
});

describe('argumentos do yt-dlp', () => {
  const plan = buildPresets(youtube(FULL))[1].plan!;
  const options = { folder: 'D:\\v', tempDir: 'D:\\t', ffmpegDir: 'C:\\f', cookies: 'none' as const };

  it('coloca a URL depois de -- para não virar opção', () => {
    const args = downloadArgs('https://a.com/v?x=1', plan, options);
    expect(args.slice(-2)).toEqual(['--', 'https://a.com/v?x=1']);
    expect(args).toContain('--ignore-config');
    expect(args).not.toContain('--cookies-from-browser');
  });

  it('usa os ids exatos e o contêiner do plano', () => {
    const args = downloadArgs('https://a.com/v', plan, options);
    expect(args[args.indexOf('-f') + 1]).toBe('299+140');
    expect(args[args.indexOf('--merge-output-format') + 1]).toBe('mp4');
  });

  it('rejeita url e plano adulterados', () => {
    expect(() => downloadArgs('--exec=calc', plan, options)).toThrow();
    expect(() => downloadArgs('file:///c:/x', plan, options)).toThrow();
    expect(() => downloadArgs('https://a.com', { ...plan, formatIds: ['1 --exec calc'] }, options)).toThrow();
    expect(() => downloadArgs('https://a.com', { ...plan, tag: '../../x' }, options)).toThrow();
    expect(() => downloadArgs('https://a.com', { ...plan, container: 'exe' as never }, options)).toThrow();
    expect(() => analyzeArgs('javascript:alert(1)', 'none')).toThrow();
  });

  it('inclui cookies só do navegador permitido', () => {
    expect(analyzeArgs('https://a.com', 'firefox')).toContain('--cookies-from-browser');
    expect(analyzeArgs('https://a.com', 'evil' as never)).not.toContain('--cookies-from-browser');
  });

  it('MP3 pede extração e bitrate', () => {
    const mp3 = buildPresets(youtube(FULL))[4].plan!;
    const args = downloadArgs('https://a.com', mp3, options);
    expect(args).toEqual(expect.arrayContaining(['-x', '--audio-format', 'mp3', '--audio-quality', '160K']));
  });
});

describe('progresso', () => {
  const plan = buildPresets(youtube([v('136', 720, 'avc1.4d401f', { filesize: 900 }), a('140', 'mp4a.40.2', 129, { filesize: 100 })]))[0].plan!;

  it('agrega vídeo, áudio e etapa final sem regredir', () => {
    const tracker = createProgressTracker(plan);
    expect(tracker.feed('FITAP 136|downloading|450|900|NA|1000|10')?.fraction).toBeCloseTo(0.4365, 3);
    expect(tracker.feed('FITAP 136|downloading|100|900|NA|1000|10')?.segmentFractions[0]).toBe(0.5);
    tracker.feed('FITAP 136|finished|900|900|NA|NA|NA');
    const audio = tracker.feed('FITAP 140|downloading|50|100|NA|500|1')!;
    expect(audio.segmentFractions).toEqual([1, 0.5]);
    expect(audio.eta).toBe(0);
    const merge = tracker.feed('FITAPP started|Merger')!;
    expect(merge.finalizing).toBe(true);
    expect(merge.stage).toBe('Juntando vídeo e áudio');
    expect(merge.speed).toBeNull();
  });

  it('ignora linhas estranhas', () => {
    const tracker = createProgressTracker(plan);
    expect(tracker.feed('[info] qualquer coisa')).toBeNull();
    expect(tracker.feed('FITAP outro|downloading|1|2|NA|NA|NA')).toBeNull();
  });
});

describe('erros', () => {
  it.each([
    ['ERROR: [youtube] x: Private video. Sign in if you have been granted access', 'private'],
    ['ERROR: Unsupported URL: https://a.com', 'invalid-link'],
    ['ERROR: [youtube] x: Video unavailable', 'gone'],
    ['ERROR: [youtube] x: Sign in to confirm you’re not a bot', 'bot'],
    ['ERROR: [youtube] x: Sign in to confirm your age', 'age'],
    ['ERROR: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>', 'network'],
    ['ERROR: [Instagram] x: Instagram sent an empty media response. Check if this post is accessible in your browser without being logged-in', 'login'],
    ['ERROR: [tiktok] x: Unable to extract universal data', 'extractor'],
    ['ERROR: Requested format is not available', 'format-gone'],
    ['ERROR: [Errno 28] No space left on device', 'disk'],
    ['ERROR: The uploader has not made this video available in your country', 'geo'],
    ['ERROR: [TikTok] 1: Your IP address is blocked from accessing this post', 'ip-block'],
    ['ERROR: [facebook] 1: Cannot parse data; please report this issue', 'extractor'],
    ['algo totalmente novo', 'unknown'],
  ])('%s → %s', (stderr, code) => {
    expect(classifyError(stderr).code).toBe(code);
  });
});

describe('utilidades', () => {
  it('extrai o link de um texto colado', () => {
    expect(extractUrl('olha isso https://vm.tiktok.com/abc/ !')).toBe('https://vm.tiktok.com/abc/');
    expect(extractUrl('(https://youtu.be/x).')).toBe('https://youtu.be/x');
    expect(extractUrl('sem link')).toBeNull();
    expect(isHttpUrl('ftp://a.com')).toBe(false);
  });

  it('formata números em pt-BR', () => {
    expect(formatBytes(1536 * 1024)).toBe('1,5 MB');
    expect(formatBytes(null)).toBe('—');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatEta(72)).toBe('1 min 12 s');
    expect(versionAgeDays('2026.10.26', new Date('2026-11-01T12:00:00Z'))).toBe(6);
  });
});

describe('regressões do teste real', () => {
  it('planos diferentes na mesma resolução e extensão geram nomes diferentes', () => {
    const info = youtube([
      v('133', 240, 'avc1.4d400c'),
      v('395', 240, 'av01.0.00M.08', { ext: 'mp4' }),
      a('140', 'mp4a.40.2', 129),
      a('139', 'mp4a.40.5', 49),
    ]);
    const tags = new Set(
      [
        { vcodec: 'h264', acodec: 'aac', abr: '129' },
        { vcodec: 'h264', acodec: 'aac', abr: '49' },
        { vcodec: 'av1', acodec: 'aac', abr: '129' },
      ].map((selection) => buildAdvanced(info, selection).plan!.tag),
    );
    expect(tags.size).toBe(3);
  });

  it('prefere vídeo separado ao combinado de mesma qualidade, para liberar a escolha do áudio', () => {
    const info = youtube([
      { format_id: '18', ext: 'mp4', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', width: 320, height: 240, tbr: 266, fps: 30 },
      v('133', 240, 'avc1.4d400c', { tbr: 180, width: 320 }),
      a('140', 'mp4a.40.2', 129),
    ]);
    const model = buildAdvanced(info, {});
    expect(model.plan?.formatIds).toEqual(['133', '140']);
    expect(model.acodecs.map((option) => option.value)).toEqual(['aac']);
    expect(buildPresets(info)[0].plan?.formatIds).toEqual(['133', '140']);
  });

  it('todo tag gerado passa na validação', () => {
    const info = youtube([v('315', 2160, 'vp9', { fps: 60, dynamic_range: 'HDR10' }), a('251', 'opus', 160)]);
    expect(isValidPlan(buildPresets(info)[0].plan)).toBe(true);
  });
});
