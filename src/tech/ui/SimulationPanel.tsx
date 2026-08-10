// Simülasyon paneli: fırlatma koşulları, çalıştırma, özet, grafikler ve arama.

import { useState } from "react";
import { useTechStore } from "../store";
import { Chart } from "./charts";

const fmt = (v: number, digits = 1): string => (Number.isFinite(v) ? v.toFixed(digits) : "—");

function Num({ label, value, onChange, unit, step, min, max }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  // Yerel taslak: yazarken akıcı, blur'da doğrulanmış/kısıtlı değer onaylanır.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => {
    let out = v;
    if (min !== undefined && out < min) out = min;
    if (max !== undefined && out > max) out = max;
    return out;
  };
  const shown = draft ?? (Number.isFinite(value) ? String(+value.toFixed(4)) : "0");
  return (
    <label className="cf">
      <span>{label}</span>
      <input
        type="number"
        value={shown}
        step={step ?? 0.01}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const v = parseFloat(raw);
          if (Number.isFinite(v)) onChange(v);
        }}
        onBlur={() => {
          setDraft(null);
          const raw = draft ?? String(value);
          const v = parseFloat(raw);
          if (Number.isFinite(v)) onChange(clamp(v));
        }}
      />
      {unit && <em>{unit}</em>}
    </label>
  );
}

export function ConditionsForm() {
  const cond = useTechStore((s) => s.rocket.conditions);
  const patchConditions = useTechStore((s) => s.patchConditions);
  const patch = (p: Record<string, unknown>) => patchConditions(p as never);

  return (
    <div className="panel">
      <div className="panel-head"><span>Fırlatma Koşulları</span></div>
      <div className="cf-form">
        <Num label="Rampa boyu" value={cond.launchRodLengthM} onChange={(v) => patch({ launchRodLengthM: v })} unit="m" />
        <Num label="Rampa açısı" value={cond.launchRodAngleDeg} onChange={(v) => patch({ launchRodAngleDeg: v })} unit="°" />
        <Num label="Rampa yönü" value={cond.launchRodDirectionDeg} onChange={(v) => patch({ launchRodDirectionDeg: v })} unit="°" />
        <Num label="Fırlatma irtifası" value={cond.launchAltitudeM} onChange={(v) => patch({ launchAltitudeM: v })} unit="m" />
        <Num label="Adım" value={cond.timestepS} onChange={(v) => patch({ timestepS: v })} unit="s" step={0.001} />
        <Num label="Azami süre" value={cond.maxTimeS} onChange={(v) => patch({ maxTimeS: v })} unit="s" step={1} />
        <label className="cf">
          <span>Rüzgar modeli</span>
          <select value={cond.windModel} onChange={(e) => patch({ windModel: e.target.value })}>
            <option value="average">Ortalama (sabit)</option>
            <option value="multilevel">Çok seviyeli</option>
          </select>
        </label>
        {cond.windModel === "average" ? (
          <>
            <Num label="Rüzgar hızı" value={cond.windSpeedMps} onChange={(v) => patch({ windSpeedMps: v })} unit="m/s" />
            <Num label="Rüzgar yönü" value={cond.windDirectionDeg} onChange={(v) => patch({ windDirectionDeg: v })} unit="°" />
            <Num label="Std. sapma" value={cond.windStdDev} onChange={(v) => patch({ windStdDev: v })} unit="m/s" />
          </>
        ) : (
          <div className="wind-levels">
            <div className="table-meta">Seviyeler (irtifa · hız · yön · σ)</div>
            {cond.windLevels.map((lv, i) => (
              <div className="cf cf-pair" key={i}>
                <input
                  type="number"
                  value={lv.altitudeM}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) {
                      const levels = cond.windLevels.map((q, j) => (j === i ? { ...q, altitudeM: v } : q));
                      patch({ windLevels: levels });
                    }
                  }}
                  title="İrtifa (m)"
                />
                <input
                  type="number"
                  value={lv.speedMps}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) {
                      const levels = cond.windLevels.map((q, j) => (j === i ? { ...q, speedMps: v } : q));
                      patch({ windLevels: levels });
                    }
                  }}
                  title="Hız (m/s)"
                />
                <input
                  type="number"
                  value={lv.directionDeg}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) {
                      const levels = cond.windLevels.map((q, j) => (j === i ? { ...q, directionDeg: v } : q));
                      patch({ windLevels: levels });
                    }
                  }}
                  title="Yön (°)"
                />
                <button
                  className="cf-del"
                  onClick={() => patch({ windLevels: cond.windLevels.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn small"
              onClick={() => patch({
                windLevels: [...cond.windLevels, { altitudeM: (cond.windLevels.at(-1)?.altitudeM ?? 0) + 200, speedMps: 5, directionDeg: 0, stdDev: 0.3 }],
              })}
            >
              + Seviye
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RunControls() {
  const runSimulation = useTechStore((s) => s.runSimulation);
  const resetSim = useTechStore((s) => s.resetSim);
  const status = useTechStore((s) => s.status);
  const setStatus = useTechStore((s) => s.setStatus);
  return (
    <div className="sim-controls">
      {status === "running" ? (
        <button className="btn launch" onClick={() => setStatus("paused")}>⏸ DURDUR</button>
      ) : status === "paused" ? (
        <button className="btn launch" onClick={() => setStatus("running")}>▶ DEVAM</button>
      ) : (
        <button className="btn launch" onClick={runSimulation}>🚀 SİMÜLASYONU ÇALIŞTIR</button>
      )}
      <button className="btn small" onClick={resetSim}>Sıfırla</button>
      <span className={`sim-status chip ${status === "ended" ? "ok" : status === "running" || status === "paused" ? "warn" : ""}`}>
        {status === "running" ? "ÇALIŞIYOR" : status === "paused" ? "DURAKLATILDI" : status === "ended" ? "TAMAMLANDI" : "HAZIR"}
      </span>
    </div>
  );
}

function SummaryGrid() {
  const result = useTechStore((s) => s.result);
  if (!result) {
    return (
      <div className="panel-empty">
        Henüz sonuç yok — koşulları ayarlayıp simülasyonu çalıştırın.
      </div>
    );
  }
  if (result.samples.length === 0) {
    return (
      <div className="panel-empty">
        Tasarım değişti — sonucu güncellemek için simülasyonu yeniden çalıştırın.
      </div>
    );
  }
  const s = result.summary;
  const cells: Array<[string, string, string]> = [
    ["Apoge", `${fmt(s.apogeeM, 0)}`, "m"],
    ["Apoge zamanı", `${fmt(s.apogeeTimeS, 1)}`, "s"],
    ["Azami hız", `${fmt(s.maxVelMps, 1)}`, "m/s"],
    ["Azami Mach", `${fmt(s.maxMach, 2)}`, ""],
    ["Azami ivme", `${fmt(s.maxAccelG, 1)}`, "g"],
    ["Uçuş süresi", `${fmt(s.flightTimeS, 0)}`, "s"],
    ["İniş hızı", `${fmt(s.landingMps, 1)}`, "m/s"],
    ["Sürüklenme", `${fmt(s.driftM, 0)}`, "m"],
    ["Raydan çıkış", `${fmt(s.railExitMps, 1)}`, "m/s"],
    ["Raydan çıkış t", `${fmt(s.railExitTimeS, 2)}`, "s"],
    ["Paraşüt t", `${s.deployTimeS >= 0 ? fmt(s.deployTimeS, 1) : "—"}`, "s"],
  ];
  return (
    <div className="metric-grid">
      {cells.map(([label, value, unit]) => (
        <div className="metric" key={label}>
          <span className="metric-label">{label}</span>
          <span className="metric-value">{value}{unit && <em> {unit}</em>}</span>
        </div>
      ))}
    </div>
  );
}

function ResultCharts() {
  const result = useTechStore((s) => s.result);
  if (!result || result.samples.length < 2) return null;
  const tel = result.samples;
  const xMax = tel[tel.length - 1].t;
  return (
    <div className="charts">
      <Chart title="İRTİFA (m)" xMax={xMax} height={110} series={[{ label: "m", color: "#4da3ff", points: tel.map((p) => [p.t, p.z]) }]} />
      <Chart title="HIZ (m/s)" xMax={xMax} height={110} series={[{ label: "m/s", color: "#ffb340", points: tel.map((p) => [p.t, p.speed]) }]} />
      <Chart title="İVME (g)" xMax={xMax} height={110} series={[{ label: "g", color: "#7dff6a", points: tel.map((p) => [p.t, p.accelG]) }]} />
    </div>
  );
}

function Scrub() {
  const result = useTechStore((s) => s.result);
  const simTime = useTechStore((s) => s.simTime);
  const setSimTime = useTechStore((s) => s.setSimTime);
  if (!result || result.samples.length < 2) return null;
  const end = result.samples[result.samples.length - 1].t;
  return (
    <div className="scrub">
      <span className="scrub-time">{fmt(simTime, 1)}s</span>
      <input
        type="range"
        min={0}
        max={end}
        step={0.01}
        value={simTime}
        onChange={(e) => setSimTime(parseFloat(e.target.value))}
      />
      <span className="scrub-time">{fmt(end, 0)}s</span>
    </div>
  );
}

export default function SimulationPanel() {
  return (
    <>
      <ConditionsForm />
      <RunControls />
      <div className="panel">
        <div className="panel-head"><span>Sonuç Özeti</span></div>
        <SummaryGrid />
      </div>
      <Scrub />
      <ResultCharts />
    </>
  );
}
