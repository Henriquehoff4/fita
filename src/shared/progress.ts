import { POST_PREFIX, PROGRESS_PREFIX } from './args';
import type { DownloadPlan } from './types';

export interface ProgressSnapshot {
  segmentFractions: number[];
  fraction: number;
  stage: string;
  finalizing: boolean;
  speed: number | null;
  eta: number | null;
  downloaded: number | null;
  total: number | null;
}

const FINALIZE_SHARE = 0.03;

const POST_LABELS: Record<string, string> = {
  Merger: 'Juntando vídeo e áudio',
  ExtractAudio: 'Convertendo o áudio',
  VideoRemuxer: 'Ajustando o formato',
  Metadata: 'Gravando as informações',
  FixupM3u8: 'Ajustando o arquivo',
  FixupM4a: 'Ajustando o arquivo',
  FixupStretched: 'Ajustando o arquivo',
};

const parseNumber = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return value && value !== 'NA' && value !== 'None' && Number.isFinite(parsed) ? parsed : null;
};

export function createProgressTracker(plan: DownloadPlan) {
  const segments = plan.segments.map((segment) => ({ ...segment, seenBytes: segment.bytes }));
  const fractions = segments.map(() => 0);
  let finalizing = false;
  let stage = segments[0] ? `Baixando ${segments[0].label}` : 'Baixando';
  let speed: number | null = null;

  const snapshot = (): ProgressSnapshot => {
    const known = segments.length > 0 && segments.every((s) => s.seenBytes);
    const total = known ? segments.reduce((sum, s) => sum + s.seenBytes!, 0) : null;
    const downloaded = known ? segments.reduce((sum, s, i) => sum + s.seenBytes! * fractions[i], 0) : null;
    const base = total ? downloaded! / total : fractions.reduce((sum, value) => sum + value, 0) / Math.max(1, fractions.length);
    const share = plan.finalize ? 1 - FINALIZE_SHARE : 1;
    const remaining = total && downloaded !== null ? total - downloaded : null;
    return {
      segmentFractions: [...fractions],
      fraction: finalizing ? share : base * share,
      stage,
      finalizing,
      speed: finalizing ? null : speed,
      eta: !finalizing && speed && remaining !== null ? Math.max(0, Math.round(remaining / speed)) : null,
      downloaded: downloaded === null ? null : Math.round(downloaded),
      total,
    };
  };

  return {
    snapshot,
    feed(line: string): ProgressSnapshot | null {
      if (line.startsWith(PROGRESS_PREFIX)) {
        const [formatId, status, downloadedRaw, totalRaw, estimateRaw, speedRaw] = line.slice(PROGRESS_PREFIX.length).split('|');
        const index = segments.findIndex((segment) => segment.formatId === formatId);
        if (index === -1) return null;
        const segment = segments[index];
        stage = `Baixando ${segment.label}`;
        const downloadedBytes = parseNumber(downloadedRaw);
        const totalBytes = parseNumber(totalRaw) ?? parseNumber(estimateRaw);
        if (totalBytes) segment.seenBytes = totalBytes;
        if (status === 'finished') {
          fractions[index] = 1;
        } else if (downloadedBytes !== null && segment.seenBytes) {
          fractions[index] = Math.max(fractions[index], Math.min(0.999, downloadedBytes / segment.seenBytes));
        }
        speed = parseNumber(speedRaw) ?? speed;
        return snapshot();
      }
      if (line.startsWith(POST_PREFIX)) {
        const [status, name] = line.slice(POST_PREFIX.length).split('|');
        const label = POST_LABELS[name?.trim() ?? ''];
        if (status === 'finished' || !label) return null;
        fractions.fill(1);
        finalizing = true;
        stage = label;
        return snapshot();
      }
      return null;
    },
  };
}
