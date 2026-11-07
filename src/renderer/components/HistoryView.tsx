import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '../../shared/display';
import type { HistoryEntry } from '../../shared/types';
import { IconDownload, IconFolder, IconPlay, IconSearch, IconTrash } from './Icons';

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function Thumb({ entry }: { entry: HistoryEntry }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="history-thumb">
      {entry.thumbnail && !failed ? <img src={entry.thumbnail} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} /> : null}
    </span>
  );
}

export function HistoryView({ onDownloadAgain }: { onDownloadAgain: (url: string) => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void window.fita.getHistory().then(setEntries);
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    if (!entries) return [];
    return term ? entries.filter((entry) => `${entry.title} ${entry.platform}`.toLocaleLowerCase('pt-BR').includes(term)) : entries;
  }, [entries, query]);

  const clearAll = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setEntries(await window.fita.clearHistory());
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>Histórico</h1>
        {entries && entries.length > 0 && (
          <button className="text-button" onClick={() => void clearAll()}>
            {confirming ? 'Confirmar: limpar a lista' : 'Limpar histórico'}
          </button>
        )}
      </div>
      <p className="page-sub">Limpar o histórico apaga só esta lista. Os arquivos continuam na pasta.</p>

      {entries && entries.length > 0 && (
        <div className="history-toolbar">
          <label className="search">
            <IconSearch />
            <span className="sr-only">Buscar no histórico</span>
            <input type="search" placeholder="Buscar por título ou site" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <p className="history-count num">
            {visible.length} {visible.length === 1 ? 'arquivo' : 'arquivos'}
          </p>
        </div>
      )}

      {entries && entries.length === 0 && (
        <div className="card empty-card">
          <p>Nada baixado até agora. Cada download concluído fica guardado aqui.</p>
        </div>
      )}
      {entries && entries.length > 0 && visible.length === 0 && <p className="empty-inline">Nenhum arquivo com “{query}”.</p>}

      <ul className="history-list">
        {visible.map((entry) => (
          <li className="history-row" key={entry.id}>
            <Thumb entry={entry} />
            <div className="history-text">
              <p className="history-title" title={entry.title}>
                {entry.title}
              </p>
              <p className="history-meta">
                {entry.platform} · {entry.summary}
                {entry.exists === false && <span className="history-missing"> · Arquivo não encontrado</span>}
              </p>
            </div>
            <div className="history-figures num">
              <span>{formatBytes(entry.size)}</span>
              <span className="history-date">{DATE.format(new Date(entry.finishedAt))}</span>
            </div>
            <div className="history-actions">
              <button className="icon-button" disabled={entry.exists === false} onClick={() => void window.fita.openHistoryFile(entry.id)} aria-label={`Abrir ${entry.title}`} title="Abrir">
                <IconPlay />
              </button>
              <button className="icon-button" disabled={entry.exists === false} onClick={() => void window.fita.showHistoryFile(entry.id)} aria-label={`Mostrar ${entry.title} na pasta`} title="Mostrar na pasta">
                <IconFolder />
              </button>
              <button className="icon-button" onClick={() => onDownloadAgain(entry.url)} aria-label={`Baixar de novo: ${entry.title}`} title="Baixar de novo">
                <IconDownload />
              </button>
              <button className="icon-button" onClick={() => void window.fita.removeHistory(entry.id).then(setEntries)} aria-label={`Tirar ${entry.title} do histórico`} title="Tirar do histórico">
                <IconTrash />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
