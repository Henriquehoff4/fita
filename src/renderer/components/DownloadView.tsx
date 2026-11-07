import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration } from '../../shared/display';
import { ERRORS } from '../../shared/errors';
import type { DownloadPlan, FitaError, HistoryEntry, Settings, ToolsStatus, VideoInfo } from '../../shared/types';
import { extractUrl } from '../../shared/url';
import { ErrorNote } from './Choice';
import { FilmFrames } from './FitaStrip';
import { IconClipboard, IconClose } from './Icons';
import { OptionsPanel } from './OptionsPanel';
import { QueueRail } from './QueueRail';

export type Analysis =
  | { kind: 'idle' }
  | { kind: 'loading'; url: string }
  | { kind: 'error'; url: string; error: FitaError }
  | { kind: 'ready'; url: string; info: VideoInfo };

const SETTINGS_ERRORS = new Set(['private', 'members', 'age', 'bot', 'login', 'cookies', 'ip-block', 'no-ytdlp', 'extractor', 'unknown']);

function Thumbnail({ info }: { info: VideoInfo }) {
  const [failed, setFailed] = useState(false);
  const best = info.streams.find((stream) => stream.width && stream.height && stream.kind !== 'audio');
  const vertical = best ? best.height! > best.width! : false;
  return (
    <div className={`film-frame${vertical ? ' is-vertical' : ''}`}>
      {info.thumbnail && !failed ? (
        <img src={info.thumbnail} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="film-empty">{info.platform}</span>
      )}
    </div>
  );
}

function MediaCard({ info }: { info: VideoInfo }) {
  return (
    <section className="card media reveal" aria-label="Vídeo analisado">
      <Thumbnail info={info} />
      <div className="media-text">
        <h2 className="media-title" title={info.title}>
          {info.title}
        </h2>
        <dl className="media-meta">
          <div>
            <dt>Duração</dt>
            <dd className="num">{formatDuration(info.duration)}</dd>
          </div>
          <div>
            <dt>Origem</dt>
            <dd>{info.platform}</dd>
          </div>
          {info.uploader && (
            <div className="media-author">
              <dt>Autor</dt>
              <dd title={info.uploader}>{info.uploader}</dd>
            </div>
          )}
        </dl>
        {info.fromPlaylist && <p className="media-note">Este link é uma lista. Só o primeiro vídeo será baixado.</p>}
      </div>
    </section>
  );
}

function LoadingCards() {
  return (
    <section className="card media" aria-busy="true" aria-label="Analisando o link">
      <FilmFrames running />
      <p className="analyzing" role="status">
        Lendo as opções deste vídeo
      </p>
    </section>
  );
}

function Welcome({ recent, onPick }: { recent: HistoryEntry[]; onPick: (url: string) => void }) {
  return (
    <section className="card welcome">
      <FilmFrames />
      <p className="welcome-text">Funciona com YouTube, TikTok, Instagram, X, Facebook, Reddit, Vimeo, Twitch e mais de mil outros sites. Ctrl+V em qualquer ponto da janela também cola o link.</p>
      {recent.length > 0 && (
        <div className="recent">
          <h2>Baixados por último</h2>
          <ul>
            {recent.slice(0, 4).map((entry) => (
              <li key={entry.id}>
                <button className="recent-row" onClick={() => onPick(entry.url)} title="Abrir as opções deste vídeo de novo">
                  <span className="recent-title">{entry.title}</span>
                  <span className="recent-meta">{entry.platform}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function DownloadView({
  analysis,
  setAnalysis,
  settings,
  tools,
  pendingUrl,
  clearPendingUrl,
  onChooseFolder,
  onOpenSettings,
}: {
  analysis: Analysis;
  setAnalysis: (analysis: Analysis) => void;
  settings: Settings | null;
  tools: ToolsStatus | null;
  pendingUrl: string | null;
  clearPendingUrl: () => void;
  onChooseFolder: () => void;
  onOpenSettings: () => void;
}) {
  const [value, setValue] = useState(analysis.kind === 'idle' ? '' : analysis.url);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.fita.getHistory().then(setRecent);
    inputRef.current?.focus();
  }, []);

  const analyze = useCallback(
    async (url: string) => {
      const id = ++requestId.current;
      setValue(url);
      setAnalysis({ kind: 'loading', url });
      const result = await window.fita.analyze(url);
      if (id !== requestId.current) return;
      if (result.ok) setAnalysis({ kind: 'ready', url, info: result.info });
      else if (!result.canceled) setAnalysis({ kind: 'error', url, error: result.error });
    },
    [setAnalysis],
  );

  useEffect(() => {
    if (!pendingUrl) return;
    clearPendingUrl();
    void analyze(pendingUrl);
  }, [pendingUrl, clearPendingUrl, analyze]);

  const fromText = useCallback(
    (text: string, emptyError: FitaError) => {
      const url = extractUrl(text);
      if (url) {
        void analyze(url);
      } else {
        requestId.current += 1;
        setAnalysis({ kind: 'error', url: text.trim(), error: emptyError });
      }
    },
    [analyze, setAnalysis],
  );

  const pasteFromClipboard = async () => {
    fromText(await window.fita.readClipboard(), ERRORS.emptyClipboard());
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text') ?? '';
      const url = extractUrl(text);
      if (!url) return;
      event.preventDefault();
      void analyze(url);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [analyze]);

  const clear = () => {
    requestId.current += 1;
    setValue('');
    setAnalysis({ kind: 'idle' });
    inputRef.current?.focus();
  };

  const download = async (plan: DownloadPlan) => {
    if (analysis.kind !== 'ready') return;
    const { info } = analysis;
    await window.fita.enqueue({ url: info.url, title: info.title, thumbnail: info.thumbnail, platform: info.platform, plan });
  };

  const hasResult = analysis.kind === 'ready';
  const typed = value.trim() !== '' && value.trim() !== (analysis.kind === 'idle' ? '' : analysis.url);
  const missingTool = tools && !tools.ytdlp.found;
  const missingFfmpeg = tools && !tools.ffmpeg.found;

  return (
    <div className="download-layout">
      <main className="flow">
        <form
          className="link-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            fromText(value, ERRORS.invalidLink());
          }}
        >
          <h1>
            <label htmlFor="link">Cole o link do vídeo</label>
          </h1>
          <div className="link-bar">
            <input
              id="link"
              ref={inputRef}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            {value && (
              <button type="button" className="icon-button" onClick={clear} aria-label="Limpar o link" title="Limpar">
                <IconClose />
              </button>
            )}
            {typed ? (
              <button type="submit" className="primary">
                Analisar
              </button>
            ) : (
              <button type="button" className={hasResult ? 'secondary' : 'primary'} onClick={() => void pasteFromClipboard()}>
                <IconClipboard /> Colar
              </button>
            )}
          </div>
        </form>

        {(missingTool || missingFfmpeg) && (
          <div className="setup-note" role="status">
            <p>
              {missingTool ? 'Falta instalar o yt-dlp, que faz os downloads.' : 'Falta instalar o ffmpeg, que junta o vídeo e o áudio.'}
            </p>
            <button className="text-button" onClick={onOpenSettings}>
              Instalar em Ajustes
            </button>
          </div>
        )}

        {analysis.kind === 'idle' && <Welcome recent={recent} onPick={(url) => void analyze(url)} />}
        {analysis.kind === 'loading' && <LoadingCards />}
        {analysis.kind === 'error' && (
          <section className="card">
            <ErrorNote title={analysis.error.title} hint={analysis.error.hint} detail={analysis.error.detail}>
              {extractUrl(analysis.url) && analysis.error.code !== 'invalid-link' && (
                <button className="text-button" onClick={() => void analyze(analysis.url)}>
                  Tentar de novo
                </button>
              )}
              {SETTINGS_ERRORS.has(analysis.error.code) && (
                <button className="text-button" onClick={onOpenSettings}>
                  Abrir Ajustes
                </button>
              )}
            </ErrorNote>
          </section>
        )}
        {analysis.kind === 'ready' && (
          <div className="result" key={analysis.info.url}>
            <MediaCard info={analysis.info} />
            <OptionsPanel info={analysis.info} settings={settings} onChooseFolder={onChooseFolder} onDownload={download} />
          </div>
        )}
      </main>
      <QueueRail onOpenSettings={onOpenSettings} />
    </div>
  );
}
