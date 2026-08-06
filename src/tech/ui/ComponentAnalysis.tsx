// Bileşen bazlı sürükleme analizi: seçilen Mach'ta parça dökümü.

import { useMemo, useState } from "react";
import { useTechStore } from "../store";
import { cdAtMach } from "../physics/drag";

const fmt = (v: number, digits = 2): string => (Number.isFinite(v) ? v.toFixed(digits) : "—");

export function ComponentAnalysis() {
  const rocket = useTechStore((s) => s.rocket);
  const [mach, setMach] = useState(0.3);
  const res = useMemo(() => cdAtMach(rocket, mach), [rocket, mach]);

  const maxCdPart = Math.max(0.001, ...res.parts.map((p) => p.cd));

  return (
    <div className="panel">
      <div className="panel-head"><span>Komponent Sürükleme Analizi</span></div>

      <div className="cf">
        <span>Mach</span>
        <input
          type="range"
          min={0}
          max={3}
          step={0.05}
          value={mach}
          onChange={(e) => setMach(parseFloat(e.target.value))}
        />
        <em>{fmt(mach, 2)}</em>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Toplam Cd</span>
          <span className="metric-value ok">{fmt(res.cdTotal, 3)}</span>
        </div>
      </div>

      <div className="table-meta">Sürükleme payları</div>
      <table className="dt">
        <thead>
          <tr><th>Bileşen</th><th className="num">Cd</th><th className="num">Pay</th></tr>
        </thead>
        <tbody>
          {res.parts.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="drag-name">{p.name}</div>
                <div className="drag-note">{p.note}</div>
              </td>
              <td className="num">{fmt(p.cd, 4)}</td>
              <td className="num">
                <span className="bar-row">
                  <span className="bar" style={{ width: `${(p.cd / maxCdPart) * 60}px` }} />
                  {fmt((p.cd / res.cdTotal) * 100, 0)}%
                </span>
              </td>
            </tr>
          ))}
          <tr className="dt-total">
            <td>Toplam</td>
            <td className="num">{fmt(res.cdTotal, 3)}</td>
            <td className="num">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}