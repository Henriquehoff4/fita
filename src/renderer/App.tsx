import { useCallback, useEffect, useState } from 'react';
import type { Settings, ToolsStatus } from '../shared/types';
import { DownloadView, type Analysis } from './components/DownloadView';
import { HistoryView } from './components/HistoryView';
import { Mark } from './components/Icons';
import { SettingsView } from './components/SettingsView';

type View = 'download' | 'history' | 'settings';

const NAV: { id: View; label: string }[] = [
  { id: 'download', label: 'Baixar' },
  { id: 'history', label: 'Histórico' },
  { id: 'settings', label: 'Ajustes' },
];

export function App() {
  const [view, setView] = useState<View>('download');
  const [analysis, setAnalysis] = useState<Analysis>({ kind: 'idle' });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const refreshTools = useCallback(async () => setTools(await window.fita.getTools()), []);

  useEffect(() => {
    void window.fita.getSettings().then(setSettings);
    void refreshTools();
  }, [refreshTools]);

  const chooseFolder = useCallback(async () => setSettings(await window.fita.chooseFolder()), []);
  const openSettings = useCallback(() => setView('settings'), []);
  const clearPendingUrl = useCallback(() => setPendingUrl(null), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <span className="wordmark">Fita</span>
        </div>
        <nav aria-label="Principal">
          {NAV.map((item) => (
            <button key={item.id} className="nav-link" aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="view">
        {view === 'download' && (
          <DownloadView
            analysis={analysis}
            setAnalysis={setAnalysis}
            settings={settings}
            tools={tools}
            pendingUrl={pendingUrl}
            clearPendingUrl={clearPendingUrl}
            onChooseFolder={() => void chooseFolder()}
            onOpenSettings={openSettings}
          />
        )}
        {view === 'history' && (
          <HistoryView
            onDownloadAgain={(url) => {
              setPendingUrl(url);
              setView('download');
            }}
          />
        )}
        {view === 'settings' && (
          <SettingsView settings={settings} tools={tools} onSettings={setSettings} onTools={refreshTools} onChooseFolder={() => void chooseFolder()} />
        )}
      </div>
    </div>
  );
}
