import type { QueueItem } from '../../shared/types';

const TOTAL_CELLS = 32;
const FINALIZE_CELLS = 2;
const MIN_CELLS = 3;

function allocate(item: QueueItem): number[] {
  const { segments, finalize } = item.plan;
  const available = TOTAL_CELLS - (finalize ? FINALIZE_CELLS : 0);
  const known = segments.every((segment) => segment.bytes);
  const total = known ? segments.reduce((sum, segment) => sum + segment.bytes!, 0) : segments.length;
  const raw = segments.map((segment) => Math.max(MIN_CELLS, Math.round((available * (known ? segment.bytes! : 1)) / total)));
  const excess = raw.reduce((sum, cells) => sum + cells, 0) - available;
  const largest = raw.indexOf(Math.max(...raw));
  raw[largest] -= excess;
  return raw;
}

function Cells({ count, fraction, pulsing }: { count: number; fraction: number; pulsing?: boolean }) {
  return (
    <span className={`strip-segment${pulsing ? ' is-pulsing' : ''}`} style={{ flexGrow: count, flexBasis: 0 }}>
      {Array.from({ length: count }, (_, index) => {
        const level = Math.max(0, Math.min(1, fraction * count - index));
        return (
          <span className="strip-cell" key={index}>
            <i style={{ opacity: level }} />
          </span>
        );
      })}
    </span>
  );
}

export function FitaStrip({ item }: { item: QueueItem }) {
  const cells = allocate(item);
  const finalizing = item.status === 'finalizing';
  const done = item.status === 'done';
  const dimmed = item.status === 'error' || item.status === 'canceled';
  const percent = Math.round(item.fraction * 100);
  return (
    <div
      className={`strip${dimmed ? ' is-dimmed' : ''}`}
      role="progressbar"
      aria-label={`Progresso de ${item.title}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%, ${item.stage}`}
    >
      {item.plan.segments.map((segment, index) => (
        <Cells key={segment.formatId} count={cells[index]} fraction={item.segmentFractions[index] ?? 0} />
      ))}
      {item.plan.finalize && <Cells count={FINALIZE_CELLS} fraction={done ? 1 : finalizing ? 1 : 0} pulsing={finalizing} />}
    </div>
  );
}

export function FilmFrames({ running }: { running?: boolean }) {
  return (
    <div className={`frames${running ? ' is-running' : ''}`} aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span className="frame" key={index} style={{ animationDelay: `${index * 90}ms` }} />
      ))}
    </div>
  );
}
