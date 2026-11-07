import { useEffect, useMemo, useState } from 'react';
import { buildAdvanced, type AdvancedSelection } from '../../shared/advanced';
import { formatBytes, formatSize } from '../../shared/display';
import { buildPresets, type PresetId } from '../../shared/presets';
import type { DownloadPlan, Settings, VideoInfo } from '../../shared/types';
import { ChipGroup } from './Choice';
import { IconCheck, IconFolder } from './Icons';

type Mode = 'simple' | 'advanced';

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <fieldset className="mode-switch" data-mode={mode}>
      <legend className="sr-only">Modo de escolha</legend>
      <span className="mode-thumb" aria-hidden="true" />
      {(['simple', 'advanced'] as const).map((value) => (
        <label key={value}>
          <input type="radio" name="mode" checked={mode === value} onChange={() => onChange(value)} />
          <span>{value === 'simple' ? 'Simples' : 'Avançado'}</span>
        </label>
      ))}
    </fieldset>
  );
}

function SimpleMode({ info, selected, onSelect }: { info: VideoInfo; selected: PresetId; onSelect: (id: PresetId) => void }) {
  const presets = useMemo(() => buildPresets(info), [info]);
  const largest = Math.max(1, ...presets.map((preset) => preset.plan?.size ?? 0));
  return (
    <fieldset className="presets swap">
      <legend className="sr-only">Qualidade</legend>
      {presets.map((preset) => {
        const size = preset.plan?.size ?? null;
        return (
          <label className={`preset${preset.plan ? '' : ' is-disabled'}`} key={preset.id}>
            <input
              type="radio"
              name="preset"
              disabled={!preset.plan}
              checked={selected === preset.id && !!preset.plan}
              onChange={() => onSelect(preset.id)}
            />
            <span className="preset-dot" aria-hidden="true" />
            <span className="preset-text">
              <span className="preset-name">{preset.name}</span>
              <span className="preset-detail">{preset.plan?.summary ?? preset.unavailable}</span>
            </span>
            {preset.plan && (
              <span className={`preset-size num${size === null ? ' is-unknown' : ''}`}>{size === null ? 'Tamanho não informado' : formatSize(size, preset.plan.sizeExact)}</span>
            )}
            {preset.plan && size !== null && (
              <span className="preset-bar" aria-hidden="true">
                <i style={{ transform: `scaleX(${Math.max(0.01, size / largest)})` }} />
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}

function AdvancedMode({ info, wanted, onChange }: { info: VideoInfo; wanted: AdvancedSelection; onChange: (patch: AdvancedSelection) => void }) {
  const model = useMemo(() => buildAdvanced(info, wanted), [info, wanted]);
  const { selection } = model;
  return (
    <div className="advanced swap">
      <ChipGroup label="Conteúdo" name="adv-mode" options={model.modes} value={selection.mode} onChange={(mode) => onChange({ mode })} />
      <ChipGroup label="Resolução" name="adv-quality" options={model.qualities} value={selection.quality} onChange={(quality) => onChange({ quality })} />
      <ChipGroup label="FPS" name="adv-fps" options={model.fps} value={selection.fps} onChange={(fps) => onChange({ fps })} />
      <ChipGroup label="Codec de vídeo" name="adv-vcodec" options={model.vcodecs} value={selection.vcodec} onChange={(vcodec) => onChange({ vcodec })} />
      <ChipGroup label="Idioma do áudio" name="adv-language" options={model.languages} value={selection.language} onChange={(language) => onChange({ language })} />
      <ChipGroup label="Codec de áudio" name="adv-acodec" options={model.acodecs} value={selection.acodec} onChange={(acodec) => onChange({ acodec })} />
      <ChipGroup label="Bitrate de áudio" name="adv-abr" options={model.abrs} value={selection.abr} onChange={(abr) => onChange({ abr })} />
      {model.embeddedAudio && (
        <div className="chip-row">
          <span className="chip-legend">Áudio</span>
          <p className="chip-note">{model.embeddedAudio}, já incluso nesta versão do vídeo</p>
        </div>
      )}
      {model.noAudio && (
        <div className="chip-row">
          <span className="chip-legend">Áudio</span>
          <p className="chip-note">Este vídeo não tem áudio</p>
        </div>
      )}
      <ChipGroup label="Formato final" name="adv-container" options={model.containers} value={selection.container} onChange={(container) => onChange({ container })} />
      <ChipGroup label="Bitrate do MP3" name="adv-mp3" options={model.mp3Bitrates} value={selection.mp3Bitrate} onChange={(mp3Bitrate) => onChange({ mp3Bitrate })} />
    </div>
  );
}

export function OptionsPanel({
  info,
  settings,
  onChooseFolder,
  onDownload,
}: {
  info: VideoInfo;
  settings: Settings | null;
  onChooseFolder: () => void;
  onDownload: (plan: DownloadPlan) => Promise<void>;
}) {
  const presets = useMemo(() => buildPresets(info), [info]);
  const firstAvailable = presets.find((preset) => preset.plan)?.id ?? 'best';
  const [mode, setMode] = useState<Mode>('simple');
  const [preset, setPreset] = useState<PresetId>(firstAvailable);
  const [wanted, setWanted] = useState<AdvancedSelection>({});
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    setPreset(firstAvailable);
    setWanted({});
    setQueued(false);
  }, [info, firstAvailable]);

  useEffect(() => {
    if (!queued) return;
    const timer = setTimeout(() => setQueued(false), 1600);
    return () => clearTimeout(timer);
  }, [queued]);

  const advanced = useMemo(() => buildAdvanced(info, wanted), [info, wanted]);
  const plan = mode === 'simple' ? presets.find((item) => item.id === preset)?.plan ?? null : advanced.plan;

  const download = async () => {
    if (!plan) return;
    await onDownload(plan);
    setQueued(true);
  };

  return (
    <section className="card options reveal" style={{ animationDelay: '60ms' }} aria-label="Opções de download">
      <div className="options-head">
        <h2>Como baixar</h2>
        <ModeSwitch mode={mode} onChange={setMode} />
      </div>
      {mode === 'simple' ? (
        <SimpleMode info={info} selected={preset} onSelect={setPreset} />
      ) : (
        <AdvancedMode info={info} wanted={wanted} onChange={(patch) => setWanted((current) => ({ ...current, ...patch }))} />
      )}
      <div className="action-bar">
        <button className="folder-button" onClick={onChooseFolder} title={settings ? `Salvar em ${settings.folder}. Clique para trocar.` : undefined}>
          <IconFolder />
          <span className="folder-path">{settings?.folder ?? '—'}</span>
          <span className="folder-change">Trocar</span>
        </button>
        <div className="action-right">
          {mode === 'advanced' && plan && <span className="action-summary">{plan.summary}</span>}
          <button className={`primary download-button${queued ? ' is-queued' : ''}`} disabled={!plan} onClick={() => void download()}>
            <span className="label-idle" aria-hidden={queued}>Baixar{plan?.size ? ` · ${plan.sizeExact ? '' : '~'}${formatBytes(plan.size)}` : ''}</span>
            <span className="label-queued" aria-hidden={!queued}>
              <IconCheck /> Na fila
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
