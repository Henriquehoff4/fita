const ONE_DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const INTEGER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024 * 1024) return `${INTEGER.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
  if (bytes < 1024 ** 3) {
    const mb = bytes / 1024 ** 2;
    return `${mb < 100 ? ONE_DECIMAL.format(mb) : INTEGER.format(mb)} MB`;
  }
  return `${ONE_DECIMAL.format(bytes / 1024 ** 3)} GB`;
}

export const formatSize = (bytes: number | null, exact: boolean): string =>
  bytes === null ? 'Tamanho desconhecido' : `${exact ? '' : '~'}${formatBytes(bytes)}`;

export const formatSpeed = (bytesPerSecond: number | null): string => (bytesPerSecond ? `${formatBytes(bytesPerSecond)}/s` : '');

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 60) return `${Math.max(1, seconds)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
  return `${Math.floor(seconds / 3600)} h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')} min`;
}

export function versionAgeDays(version: string | null, now = new Date()): number | null {
  const match = version?.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!match) return null;
  const built = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.max(0, Math.floor((now.getTime() - built) / 86400000));
}
