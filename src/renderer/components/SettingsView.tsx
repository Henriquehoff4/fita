import { useEffect, useState } from 'react';
import { versionAgeDays } from '../../shared/display';
import type { CookieBrowser, FitaError, InstallProgress, Settings, ToolsStatus } from '../../shared/types';
import { ChipGroup, ErrorNote } from './Choice';
import { IconFolder } from './Icons';

const COOKIE_OPTIONS: { value: CookieBrowser; label: string }[] = [
  { value: 'none', label: 'Não usar' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'edge', label: 'Edge' },
  { value: 'brave', label: 'Brave' },
  { value: 'opera', label: 'Opera' },
  { value: 'vivaldi', label: 'Vivaldi' },
];

const PHASE_LABEL: Record<InstallProgress['phase'], string> = {
  checking: 'Procurando a última versão',
  downloading: 'Baixando',
  verifying: 'Conferindo o arquivo',
  installing: 'Instalando',
};

function ageText(version: string | null): string {
  const days = versionAgeDays(version);
  if (days === null) return '';
  if (days === 0) return 'lançada hoje';
  return days === 1 ? 'lançada há 1 dia' : `lançada há ${days} dias`;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="setting">
      <div className="setting-label">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="setting-panel card">{children}</div>
    </section>
  );
}

function ToolRow({
  name,
  purpose,
  version,
  found,
  note,
  action,
  onAction,
  busy,
}: {
  name: string;
  purpose: string;
  version: string | null;
  found: boolean;
  note?: string;
  action?: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="tool-row">
      <div>
        <p className="tool-name">{name}</p>
        <p className="tool-purpose">{purpose}</p>
        <p className="tool-version num">
          {found ? version ?? 'Instalado' : 'Não instalado'}
          {note ? ` · ${note}` : ''}
        </p>
      </div>
      {action && (
        <button className="secondary" onClick={onAction} disabled={busy}>
          {action}
        </button>
      )}
    </div>
  );
}

export function SettingsView({
  settings,
  tools,
  onSettings,
  onTools,
  onChooseFolder,
}: {
  settings: Settings | null;
  tools: ToolsStatus | null;
  onSettings: (settings: Settings) => void;
  onTools: () => Promise<void>;
  onChooseFolder: () => void;
}) {
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<FitaError | null>(null);

  useEffect(() => window.fita.onInstallProgress(setProgress), []);

  const update = async (patch: Partial<Settings>) => onSettings(await window.fita.updateSettings(patch));

  const runInstall = async (action: () => ReturnType<typeof window.fita.updateYtdlp>, name: string) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    const result = await action();
    setBusy(false);
    setProgress(null);
    if (result.ok) {
      setMessage(result.updated ? `${name} ${result.version} instalado.` : `${name} já está na última versão (${result.version}).`);
    } else {
      setError(result.error);
    }
    await onTools();
  };

  const ytdlpAge = versionAgeDays(tools?.ytdlp.version ?? null);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Ajustes</h1>
      </div>

      <Section title="Pasta de destino" description="Onde os arquivos ficam salvos.">
        <div className="folder-setting">
          <p className="folder-value" title={settings?.folder}>
            <IconFolder /> <span>{settings?.folder ?? '—'}</span>
          </p>
          <div className="folder-buttons">
            <button className="text-button" onClick={() => void window.fita.openFolder()}>
              Abrir
            </button>
            <button className="secondary" onClick={onChooseFolder}>
              Trocar pasta
            </button>
          </div>
        </div>
      </Section>

      <Section title="Downloads ao mesmo tempo" description="Os demais esperam na fila.">
        <ChipGroup
          label="Quantidade"
          name="concurrency"
          options={[1, 2, 3, 4].map((count) => ({ value: String(count), label: String(count) }))}
          value={String(settings?.concurrency ?? 2)}
          onChange={(value) => void update({ concurrency: Number(value) })}
        />
      </Section>

      <Section
        title="Usar login do navegador"
        description="Libera vídeos privados, com restrição de idade ou que exigem conta. O app lê os cookies do navegador só neste PC e os envia apenas ao site do vídeo. Eles não ficam salvos no app."
      >
        <ChipGroup
          label="Navegador"
          name="cookies"
          options={COOKIE_OPTIONS}
          value={settings?.cookies ?? 'none'}
          onChange={(value) => void update({ cookies: value as CookieBrowser })}
        />
        {settings && ['chrome', 'edge', 'brave', 'opera', 'vivaldi'].includes(settings.cookies) && (
          <p className="setting-note">Navegadores baseados em Chromium costumam bloquear essa leitura no Windows. Se falhar, feche o navegador ou use o Firefox.</p>
        )}
      </Section>

      <Section title="Ferramentas" description="O que faz o trabalho pesado. Se um site parar de funcionar, atualize o yt-dlp primeiro.">
        <ToolRow
          name="yt-dlp"
          purpose="Lê os links e baixa os vídeos."
          version={tools?.ytdlp.version ?? null}
          found={!!tools?.ytdlp.found}
          note={ageText(tools?.ytdlp.version ?? null)}
          action={tools?.ytdlp.found ? 'Atualizar' : 'Instalar'}
          busy={busy}
          onAction={() => void runInstall(() => window.fita.updateYtdlp(), 'yt-dlp')}
        />
        {ytdlpAge !== null && ytdlpAge > 45 && <p className="setting-note">Esta versão tem mais de 45 dias. Vale atualizar: os sites mudam com frequência.</p>}
        <ToolRow
          name="ffmpeg"
          purpose="Junta o vídeo e o áudio e converte para MP3."
          version={tools?.ffmpeg.version ?? null}
          found={!!tools?.ffmpeg.found}
          action={!tools?.ffmpeg.found && tools?.canInstallFfmpeg ? 'Instalar' : undefined}
          busy={busy}
          onAction={() => void runInstall(() => window.fita.installFfmpeg(), 'ffmpeg')}
        />
        <ToolRow
          name="Deno"
          purpose="O YouTube precisa dele para liberar todas as qualidades."
          version={tools?.deno.version ?? null}
          found={!!tools?.deno.found}
          note={tools?.deno.found ? undefined : 'instale com: winget install DenoLand.Deno'}
        />
        <div className="tool-feedback" aria-live="polite">
          {progress && (
            <p>
              {PHASE_LABEL[progress.phase]}
              {progress.fraction !== null ? ` · ${Math.round(progress.fraction * 100)}%` : ''}
            </p>
          )}
          {message && <p>{message}</p>}
        </div>
        {error && <ErrorNote title={error.title} hint={error.hint} detail={error.detail} />}
      </Section>

      <p className="legal">Baixe apenas o que você tem direito de usar. Alguns sites proíbem o download nos termos de uso.</p>
    </main>
  );
}
