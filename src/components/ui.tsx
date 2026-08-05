// Paylaşılan form öğeleri: sayı, seçim, anahtar (toggle), bölüm başlığı.

import { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

export function NumField({
  label, value, min, max, step, unit, onChange, disabled,
}: {
  label: string; value: number; min?: number; max?: number; step?: number; unit?: string;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          onWheel={(e) => {
            if (disabled) return;
            e.preventDefault();
            const s = step ?? 1;
            let v = value + (e.deltaY < 0 ? s : -s);
            if (min !== undefined && v < min) v = min;
            if (max !== undefined && v > max) v = max;
            if (v !== value) onChange(v);
          }}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </span>
    </label>
  );
}

export function SelectField({
  label, value, options, onChange, disabled,
}: {
  label: string; value: string; options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function ToggleField({
  label, value, onChange, disabled,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="field field-toggle">
      <span className="field-label">{label}</span>
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function Meter({ label, value, display, max }: { label: string; value: number; display: string; max: number }) {
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <span className="meter-val">{display}</span>
      </div>
      <div className="meter-bar">
        <div className="meter-fill" style={{ width: `${Math.min(100, (value / Math.max(max, 1e-9)) * 100)}%` }} />
      </div>
    </div>
  );
}
