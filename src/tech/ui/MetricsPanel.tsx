// Ölçümler paneli: montaj özeti + bileşen kütle tablosu + Barrowman dökümü.

import { useMemo } from "react";
import { useTechStore } from "../store";
import { assembleTech } from "../physics/assembly";
import { analyzeBarrowman } from "../physics/barrowman";
import { TECH_COMPONENT_LABELS } from "../model";
import { GOOD_STABILITY_CALIBERS, MIN_STABILITY_CALIBERS, MIN_TWR } from "../../physics/acceptance";

const fmt = (v: number, digits = 1): string => (Number.isFinite(v) ? v.toFixed(digits) : "—");

export function MetricsPanel() {
  const rocket = useTechStore((s) => s.rocket);
  const a = useMemo(() => assembleTech(rocket), [rocket]);
  const bar = useMemo(() => analyzeBarrowman(rocket), [rocket]);

  const metricsList = (aa: typeof a): Array<{ label: string; value: string }> => [
    { label: "Toplam uzunluk", value: `${fmt(aa.totalLength * 1000, 0)} mm` },
    { label: "Referans çap", value: `${fmt(aa.referenceDiameter * 1000, 1)} mm` },
    { label: "Yapı kütlesi", value: `${fmt(aa.structureMass * 1000, 0)} g` },
    { label: "Motor kütlesi", value: `${fmt((aa.liftoffMass - aa.structureMass) * 1000, 0)} g` },
    { label: "Kalkış kütlesi", value: `${fmt(aa.liftoffMass * 1000, 0)} g` },
    { label: "İtici kütlesi", value: `${fmt(aa.propellantMass * 1000, 0)} g` },
    { label: "İtki/ağırlık (TWR)", value: `${fmt(aa.twr, 2)}` },
  ];

  const safe = a.liftoffMass > 1e-9;
  const stabState = !safe ? "" : a.stability >= GOOD_STABILITY_CALIBERS ? "ok" : a.stability >= MIN_STABILITY_CALIBERS ? "warn" : "bad";
  const stabLabel = !safe ? "—" : a.stability >= GOOD_STABILITY_CALIBERS ? "STABİL" : a.stability >= MIN_STABILITY_CALIBERS ? "SINIRDA" : "İSTİKRARSIZ";
  const twrBad = safe && a.twr < MIN_TWR;

  return (
    <div className="panel">
      <div className="panel-head"><span>Kütle & Geometri</span></div>

      <div className="stab-row">
        <span className={`stab-chip ${stabState}`}>{stabLabel}</span>
        <span className="stab-detail">
          <b>{safe ? fmt(a.stability, 2) : "—"}</b> kalibre · CP {fmt(a.cp * 1000, 0)} mm · CG {fmt(a.cg * 1000, 0)} mm
          {twrBad && <em className="muted"> · TWR {fmt(a.twr, 2)} — kalkış riskli</em>}
        </span>
      </div>

      <div className="metric-grid">
        {metricsList(a).map((m) => (
          <div className="metric" key={m.label}>
            <span className="metric-label">{m.label}</span>
            <span className="metric-value">{m.value}</span>
          </div>
        ))}
      </div>

      <div className="metric-grid">
        {[
          ["CG (burun ucundan)", `${fmt(a.cg * 1000, 0)} mm`],
          ["CP (burun ucundan)", `${fmt(a.cp * 1000, 0)} mm`],
          ["Stabilite", `${safe ? fmt(a.stability, 2) : "—"} kalibre`],
          ["Cn total", `${fmt(a.cnTotal, 1)}`],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span className="metric-label">{label}</span>
            <span className={`metric-value ${label === "Stabilite" ? (a.stability >= GOOD_STABILITY_CALIBERS ? "ok" : "bad") : ""}`}>{value}</span>
          </div>
        ))}
      </div>

      <div className="table-meta">Bileşen kütle dağılımı</div>
      <table className="dt">
        <thead>
          <tr><th>Bileşen</th><th className="num">Kütle</th><th className="num">CG</th><th className="num">Konum</th></tr>
        </thead>
        <tbody>
          {a.placements.map((p) => (
            <tr key={p.id}>
              <td>{TECH_COMPONENT_LABELS[p.kind]}</td>
              <td className="num">{fmt(p.massKg * 1000, 0)} g</td>
              <td className="num">{fmt(p.cgM * 1000, 0)} mm</td>
              <td className="num">{fmt(p.x * 1000, 0)} mm</td>
            </tr>
          ))}
          <tr className="dt-total">
            <td>Toplam</td>
            <td className="num">{fmt(a.liftoffMass * 1000, 0)} g</td>
            <td className="num">{safe ? fmt(a.cg * 1000, 0) : "—"}</td>
            <td className="num">{safe ? fmt(a.totalLength * 1000, 0) : "—"}</td>
          </tr>
        </tbody>
      </table>

      <div className="table-meta">Barrowman normal kuvvet dökümü</div>
      <table className="dt">
        <thead>
          <tr><th>Bileşen</th><th className="num">Cn</th><th className="num">CP</th></tr>
        </thead>
        <tbody>
          {bar.parts.map((p, i) => (
            <tr key={i}>
              <td>{p.name}</td>
              <td className="num">{fmt(p.cn, 2)}</td>
              <td className="num">{fmt(p.cpM * 1000, 0)} mm</td>
            </tr>
          ))}
          {bar.parts.length === 0 && (
            <tr><td colSpan={3} className="muted">Normal kuvvet katkısı yok</td></tr>
          )}
          <tr className="dt-total">
            <td>Toplam</td>
            <td className="num">{fmt(bar.cnTotal, 2)}</td>
            <td className="num">{fmt(bar.cp * 1000, 0)} mm</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}