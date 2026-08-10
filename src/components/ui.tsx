// Paylaşılan form öğeleri: sayı, seçim, anahtar (toggle), bölüm başlığı.

import { useState, ReactNode } from "react";

/** Sayıyı kayan nokta çöpü olmadan göster (0.30000000000000004 → 0.3). */
function fmtValue(v: number): string {
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1e7) return String(Math.round(v));
  const s = v.toFixed(6);
  return s.replace(/\.?0+$/, "");
}

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
  // Yerel taslak (draft): kullanıcı yazarken girdi akıcı kalır; onay
  // (blur) sonrası sınıra klamplanır ve store'a yazılır.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => {
    let out = v;
    if (min !== undefined && out < min) out = min;
    if (max !== undefined && out > max) out = max;
    return out;
  };
  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return false; // boş/geçersiz/Infinity → reddet
    onChange(clamp(v));
    return true;
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          inputMode="decimal"
          value={draft ?? (Number.isFinite(value) ? fmtValue(value) : "0")}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            commit(raw);
          }}
          onBlur={(e) => {
            setDraft(null);
            const raw = e.target.value;
            if (raw === "" || !Number.isFinite(parseFloat(raw))) {
              // Boş/geçersiz: geçerli sınıra çek
              const fallback = clamp(Number.isFinite(value) ? value : (min ?? 0));
              onChange(fallback);
              return;
            }
            commit(raw); // sınıra klamplanmış hali onayla
          }}
          onWheel={(e) => {
            if (disabled) return;
            e.preventDefault();
            const s = step ?? 1;
            let v = value + (e.deltaY < 0 ? s : -s);
            v = clamp(v);
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
