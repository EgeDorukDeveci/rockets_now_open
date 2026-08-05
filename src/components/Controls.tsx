// Uçuş kontrolleri: fırlat, duraklat, hız, kaydırıcı, sonuç özeti.

import { useStore } from "../store";
import { warningCounts } from "../physics/validate";

export default function Controls() {
  const status = useStore((s) => s.status);
  const simTime = useStore((s) => s.simTime);
  const speed = useStore((s) => s.speed);
  const result = useStore((s) => s.result);
  const warnings = useStore((s) => s.warnings);
  const assembly = useStore((s) => s.assembly);
  const prediction = useStore((s) => s.prediction);

  const launch = useStore((s) => s.launch);
  const reset = useStore((s) => s.reset);
  const setStatus = useStore((s) => s.setStatus);
  const setSimTime = useStore((s) => s.setSimTime);
  const setSpeed = useStore((s) => s.setSpeed);

  const counts = warningCounts(warnings);
  const end = result ? result.telemetry[result.telemetry.length - 1].t : 1;

  const designBlocked = counts.errors > 0;
  const inFlight = status !== "idle" && status !== "ended";

  const twr = assembly.twr;
  const twrCls = twr < 1 ? "bad" : twr < 1.3 ? "warn" : "";
  const stabCls = assembly.stabilityCal < 1 ? "bad" : assembly.stabilityCal < 2 ? "warn" : "";

  return (
    <div className="controls">
      <div className="controls-row">
        <button
          className={`btn launch ${inFlight ? "disabled" : ""}`}
          disabled={inFlight || designBlocked}
          title={
            designBlocked
              ? "Tasarımda hata var — düzeltmeden fırlatılamaz."
              : undefined
          }
          onClick={launch}
        >
          🚀 FIRLAT
        </button>
        <button
          className="btn"
          onClick={() => setStatus(status === "running" ? "paused" : "running")}
          disabled={status !== "running" && status !== "paused"}
          title={status === "ended" ? "Uçuş bitti — yeniden fırlatmak için Sıfırla." : undefined}
        >
          {status === "running" ? "⏸ Durdur" : "▶ Devam"}
        </button>
        <button className="btn" onClick={reset}>↺ Sıfırla</button>
        <select className="speed" value={String(speed)} onChange={(e) => setSpeed(parseFloat(e.target.value))}>
          {["0.25", "0.5", "1", "2", "4", "8"].map((v) => (
            <option key={v} value={v}>{v}×</option>
          ))}
        </select>
      </div>
      <div className="scrubber-row">
        <span className="time">{simTime.toFixed(1)}s</span>
        <input
          type="range"
          min={0}
          max={end}
          step={0.05}
          value={Math.min(simTime, end)}
          onChange={(e) => setSimTime(parseFloat(e.target.value))}
          disabled={!result}
        />
        <span className="time">{end.toFixed(1)}s</span>
      </div>
      {result && (
        <div className={`mission ${result.success ? "ok" : "fail"}`}>
          {result.message}
        </div>
      )}
      <div className="summary">
        <div className="summary-item">
          <span className="s-label">Kütle</span>
          <span className="s-val">{(assembly.liftoffMassKg * 1000).toFixed(0)} g</span>
        </div>
        <div className="summary-item">
          <span className="s-label">T/W</span>
          <span className={`s-val ${twrCls}`}>{twr.toFixed(1)}</span>
        </div>
        <div className="summary-item">
          <span className="s-label">Stabilite</span>
          <span className={`s-val ${stabCls}`}>{assembly.stabilityCal.toFixed(2)} kal</span>
        </div>
        <div className="summary-item">
          <span className="s-label">CP</span>
          <span className="s-val">{(assembly.cpM * 100).toFixed(0)} cm</span>
        </div>
        <div className="summary-item">
          <span className="s-label">CG</span>
          <span className="s-val">{(assembly.cgM * 100).toFixed(0)} cm</span>
        </div>
        <div className="summary-item">
          <span className="s-label">Tahmini apogee</span>
          <span className="s-val">{prediction ? prediction.apogeeM.toFixed(0) : "—"} m</span>
        </div>
        <div className="summary-item">
          <span className="s-label">İniş hızı</span>
          <span className="s-val">{prediction ? prediction.landingMps.toFixed(1) : "—"} m/s</span>
        </div>
        <div className="summary-item">
          <span className="s-label">Maliyet</span>
          <span className="s-val">{assembly.cost.toFixed(0)} ₺</span>
        </div>
        <div className="summary-item">
          <span className="s-label">Durum</span>
          <span className={`s-val ${counts.errors > 0 ? "bad" : counts.warnings > 0 ? "warn" : "good"}`}>
            {counts.errors === 0 && counts.warnings === 0
              ? "Hazır"
              : `${counts.errors} hata · ${counts.warnings} uyarı`}
          </span>
        </div>
      </div>
    </div>
  );
}
