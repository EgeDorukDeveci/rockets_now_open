// Cd-Mach tablosu: transonik tepe ve süpersonik düşüşü gösterir.

import { useMemo } from "react";
import { useTechStore } from "../store";
import { cdMachTable } from "../physics/drag";

const fmt = (v: number, digits = 2): string => (Number.isFinite(v) ? v.toFixed(digits) : "—");

export function CdMachPanel() {
  const rocket = useTechStore((s) => s.rocket);
  const table = useMemo(() => cdMachTable(rocket, 3, 0.1), [rocket]);
  const sub = table[0]?.cdTotal ?? 1;
  const maxCd = Math.max(...table.map((r) => r.cdTotal), 0.001);

  return (
    <div className="panel">
      <div className="panel-head"><span>Cd–Mach Tablosu</span></div>

      <div className="zone-legend">
        <span className="zone-tag sub">Subsonik</span>
        <span className="zone-tag trans">Transonik</span>
        <span className="zone-tag super">Süpersonik</span>
      </div>

      <div className="table-scroll">
        <table className="dt">
          <thead>
            <tr><th>Mach</th><th className="num">Cd</th><th>Cd/Mach eğrisi</th><th className="num">Görünüm</th></tr>
          </thead>
          <tbody>
            {table.map((r) => {
              const zone = r.mach < 0.7 ? "sub" : r.mach <= 1.2 ? "trans" : "super";
              return (
                <tr key={r.mach} className={r.mach > 0 && Math.abs(r.mach - 1.1) < 0.05 ? "peak" : ""}>
                  <td>{fmt(r.mach, 1)}</td>
                  <td className="num">{fmt(r.cdTotal, 3)}</td>
                  <td>
                    <span className="bar-row">
                      <span className={`bar bar-${zone}`} style={{ width: `${(r.cdTotal / maxCd) * 120}px` }} />
                    </span>
                  </td>
                  <td className={`num ${zone}`}>{r.cdTotal / sub >= 1.5 ? "↑" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel-note">
        Subsonik Cd ≈ {fmt(sub, 3)}; transonik tepe {fmt(maxCd, 3)} ({fmt((maxCd / sub) * 100, 0)}% subsonik) — kabul kriteri ≥1.5×.
      </div>
    </div>
  );
}