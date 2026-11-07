import type { Option } from '../../shared/advanced';

export function ChipGroup({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (!options.length) return null;
  return (
    <fieldset className="chip-row">
      <legend>{label}</legend>
      <div className="chips">
        {options.map((option) => (
          <label className="chip" key={option.value}>
            <input type="radio" name={name} value={option.value} checked={option.value === value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ErrorNote({ title, hint, detail, children }: { title: string; hint: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="error-note" role="alert">
      <p className="error-title">{title}</p>
      <p className="error-hint">{hint}</p>
      {children && <div className="error-actions">{children}</div>}
      {detail && (
        <details className="error-detail">
          <summary>Detalhes técnicos</summary>
          <pre>{detail}</pre>
        </details>
      )}
    </div>
  );
}
