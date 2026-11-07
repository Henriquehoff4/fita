import { useEffect, useRef, useState } from 'react';
import { formatBytes, formatEta, formatSpeed } from '../../shared/display';
import type { QueueItem } from '../../shared/types';
import { ErrorNote } from './Choice';
import { FitaStrip } from './FitaStrip';
import { IconClose, IconFolder, IconPlay, IconRetry } from './Icons';

function transferLine(item: QueueItem): string {
  return [
    item.total ? `${formatBytes(item.downloaded)} de ${formatBytes(item.total)}` : '',
    formatSpeed(item.speed),
    item.eta !== null ? `faltam ${formatEta(item.eta)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function Row({ item, onOpenSettings }: { item: QueueItem; onOpenSettings: () => void }) {
  const active = item.status === 'queued' || item.status === 'downloading' || item.status === 'finalizing';
  const percent = Math.round(item.fraction * 100);
  const showPercent = item.status === 'downloading' || item.status === 'finalizing';
  return (
    <li className={`queue-row is-${item.status}`}>
      <div className="queue-head">
        <p className="queue-title" title={item.title}>
          {item.title}
        </p>
        <div className="queue-actions">
          {item.status === 'done' && item.filePath && (
            <>
              <button className="icon-button" onClick={() => void window.fita.openQueueFile(item.id)} aria-label={`Abrir ${item.title}`} title="Abrir">
                <IconPlay />
              </button>
              <button className="icon-button" onClick={() => void window.fita.showQueueFile(item.id)} aria-label={`Mostrar ${item.title} na pasta`} title="Mostrar na pasta">
                <IconFolder />
              </button>
            </>
          )}
          {(item.status === 'error' || item.status === 'canceled') && (
            <button className="icon-button" onClick={() => void window.fita.retry(item.id)} aria-label={`Tentar de novo: ${item.title}`} title="Tentar de novo">
              <IconRetry />
            </button>
          )}
          {active ? (
            <button className="icon-button" onClick={() => void window.fita.cancel(item.id)} aria-label={`Cancelar ${item.title}`} title="Cancelar">
              <IconClose />
            </button>
          ) : (
            <button className="icon-button" onClick={() => void window.fita.dismiss(item.id)} aria-label={`Tirar ${item.title} da fila`} title="Tirar da fila">
              <IconClose />
            </button>
          )}
        </div>
      </div>
      <p className="queue-summary">{item.plan.summary}</p>
      {item.status !== 'error' && <FitaStrip item={item} />}
      {item.status === 'error' && item.error ? (
        <ErrorNote title={item.error.title} hint={item.error.hint} detail={item.error.detail}>
          {['private', 'members', 'age', 'bot', 'login', 'cookies', 'ip-block', 'ffmpeg', 'no-ytdlp', 'extractor', 'unknown', 'disk', 'permission'].includes(item.error.code) && (
            <button className="text-button" onClick={onOpenSettings}>
              Abrir Ajustes
            </button>
          )}
        </ErrorNote>
      ) : (
        <div className="queue-status">
          <span>{item.stage}</span>
          <span className="num">{showPercent ? `${percent}%` : item.status === 'done' ? formatBytes(item.total) : ''}</span>
        </div>
      )}
      {item.status === 'downloading' && transferLine(item) && <p className="queue-amount num">{transferLine(item)}</p>}
    </li>
  );
}

export function QueueRail({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    void window.fita.getQueue().then((list) => setItems([...list]));
    return window.fita.onQueue((list) => setItems([...list]));
  }, []);

  const [announcement, setAnnouncement] = useState('');
  const lastStatus = useRef(new Map<string, QueueItem['status']>());

  useEffect(() => {
    for (const item of items) {
      const previous = lastStatus.current.get(item.id);
      if (previous && previous !== item.status) {
        if (item.status === 'done') setAnnouncement(`Concluído: ${item.title}`);
        if (item.status === 'error') setAnnouncement(`Falhou: ${item.title}. ${item.error?.title ?? ''}`);
        if (item.status === 'canceled') setAnnouncement(`Cancelado: ${item.title}`);
      }
      if (!previous && item.status === 'queued') setAnnouncement(`Na fila: ${item.title}`);
      lastStatus.current.set(item.id, item.status);
    }
  }, [items]);

  const finished = items.filter((item) => ['done', 'error', 'canceled'].includes(item.status)).length;
  const active = items.length - finished;

  return (
    <aside className="rail" aria-label="Fila de downloads">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="rail-head">
        <h2>
          Fila {active > 0 && <span className="count num">{active}</span>}
        </h2>
        {finished > 0 && (
          <button className="text-button" onClick={() => void window.fita.clearFinished()}>
            Limpar finalizados
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rail-empty">Nenhum download agora. O que você baixar aparece aqui, com o progresso.</p>
      ) : (
        <ul className="queue-list">
          {items.map((item) => (
            <Row key={item.id} item={item} onOpenSettings={onOpenSettings} />
          ))}
        </ul>
      )}
    </aside>
  );
}
