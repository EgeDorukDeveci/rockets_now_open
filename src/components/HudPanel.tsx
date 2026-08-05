// Telemetri HUD, canvas grafikler ve olay timeline'ı (doküman §6).

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useStore } from "../store";
import { eventLabel } from "../physics/events";
import { FlightEvent } from "../physics/events";

function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        <span className="stat-tick" key={value}>
          {value}
        </span>
        {unit && <span className="stat-unit"> {unit}</span>}
      </div>
    </div>
  );
}

export function HudPanel() {
  const sample = useStore((s) => s.currentSample);
  const prediction = useStore((s) => s.prediction);
  const result = useStore((s) => s.result);

  const s = sample;
  const pred = prediction;

  return (
    <div className="hud">
      <div className="hud-grid">
        <Stat label="İRTİFA" value={s ? fmt(s.altM, 0) : "—"} unit="m" />
        <Stat label="HIZ" value={s ? fmt(s.velMps) : "—"} unit="m/s" />
        <Stat label="DÜŞEY HIZ" value={s ? fmt(s.vertMps) : "—"} unit="m/s" />
        <Stat label="MACH" value={s ? fmt(s.mach, 2) : "—"} />
        <Stat label="İTKİ" value={s ? fmt(s.thrustN) : "—"} unit="N" />
        <Stat label="KÜTLE" value={s ? fmt(s.massKg * 1000, 0) : "—"} unit="g" />
        <Stat label="MAX HIZ" value={result ? fmt(result.maxVelMps) : pred ? fmt(pred.maxVelMps) : "—"} unit="m/s" />
        <Stat label="APOGEE" value={result ? fmt(result.maxAltM, 0) : pred ? fmt(pred.apogeeM, 0) : "—"} unit="m" />
      </div>
      <Charts />
      <Timeline />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grafikler
// ---------------------------------------------------------------------------

function drawChart(
  canvas: HTMLCanvasElement,
  series: { label: string; color: string; points: Array<[number, number]> }[],
  xMax: number,
) {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0d1420";
  ctx.fillRect(0, 0, w, h);

  const padL = 34;
  const padB = 16;
  const padT = 6;
  const plotW = w - padL - 6;
  const plotH = h - padB - padT;

  let yMax = 0;
  let yMin = 0;
  for (const s of series) {
    for (const [, v] of s.points) {
      if (Math.abs(v) > yMax) yMax = Math.abs(v);
      if (v < yMin) yMin = v;
    }
  }
  if (yMax === 0) yMax = 1;
  const span = yMax - Math.min(yMin, 0);

  // Izgara
  ctx.strokeStyle = "#1c2736";
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - 6, y);
    ctx.stroke();
  }
  const vGrid = 5;
  for (let i = 0; i <= vGrid; i++) {
    const x = padL + (plotW * i) / vGrid;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, h - padB);
    ctx.stroke();
  }

  // Sıfır ekseni
  if (yMin < 0) {
    ctx.strokeStyle = "#31415a";
    ctx.beginPath();
    const y0 = padT + plotH - (yMax / span) * plotH;
    ctx.moveTo(padL, y0);
    ctx.lineTo(w - 6, y0);
    ctx.stroke();
  }

  ctx.fillStyle = "#6b7d94";
  ctx.font = "9px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= gridLines; i++) {
    const val = (yMax * (gridLines - i)) / gridLines;
    ctx.fillText(fmt(val, val >= 100 ? 0 : 1), padL - 4, padT + (plotH * i) / gridLines + 3);
  }
  ctx.font = "8px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  for (let i = 1; i < vGrid; i++) {
    const t = (xMax * i) / vGrid;
    ctx.fillText(fmt(t, t >= 10 ? 0 : 1), padL + (plotW * i) / vGrid, h - 5);
  }

  const X = (t: number) => padL + (t / Math.max(xMax, 1e-6)) * plotW;
  const Y = (v: number) => padT + plotH - ((v - Math.min(yMin, 0)) / span) * plotH;
  const baseY = padT + plotH;
  const hexToRgba = (hex: string, a: number): string => {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  for (const s of series) {
    if (s.points.length < 2) continue;
    // Doku altına yumuşak alan dolgusu — eğriyi okumayı kolaylaştırır.
    const fill = ctx.createLinearGradient(0, padT, 0, baseY);
    fill.addColorStop(0, hexToRgba(s.color, 0.28));
    fill.addColorStop(0.7, hexToRgba(s.color, 0.06));
    fill.addColorStop(1, hexToRgba(s.color, 0));
    ctx.beginPath();
    ctx.moveTo(X(s.points[0][0]), baseY);
    for (let i = 0; i < s.points.length; i++) ctx.lineTo(X(s.points[i][0]), Y(s.points[i][1]));
    ctx.lineTo(X(s.points[s.points.length - 1][0]), baseY);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // Çizgi çizimi üstte kalır
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(X(s.points[0][0]), Y(s.points[0][1]));
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(X(s.points[i][0]), Y(s.points[i][1]));
    }
    ctx.stroke();
  }
}

function Chart({ kind, xMax, series }: {
  kind: string; xMax: number;
  series: { label: string; color: string; points: Array<[number, number]> }[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawChart(ref.current, series, xMax);
  }, [series, xMax]);
  return (
    <div className="chart">
      <div className="chart-title">{kind}</div>
      <canvas ref={ref} style={{ width: "100%", height: 70 }} />
    </div>
  );
}

function Charts() {
  const result = useStore((s) => s.result);
  if (!result) {
    return (
      <div className="charts">
        <div className="chart-empty">
          <strong>Henüz uçuş yok</strong>
          Fırlatınca telemetri grafikleri burada çizilir.
        </div>
      </div>
    );
  }
  const tel = result.telemetry;
  const xMax = tel.length > 1 ? tel[tel.length - 1].t : 1;
  const alt = tel.map((s) => [s.t, s.altM] as [number, number]);
  const vel = tel.map((s) => [s.t, s.velMps] as [number, number]);
  const acc = tel.map((s) => [s.t, s.q / 1000] as [number, number]);
  const thr = tel.map((s) => [s.t, s.thrustN] as [number, number]);
  return (
    <div className="charts">
      <Chart kind="İRTİFA" xMax={xMax} series={[{ label: "m", color: "#4da3ff", points: alt }]} />
      <Chart kind="HIZ" xMax={xMax} series={[{ label: "m/s", color: "#ffb340", points: vel }]} />
      <Chart kind="DİNAMİK BASINÇ (kPa)" xMax={xMax} series={[{ label: "kPa", color: "#ff5c7a", points: acc }]} />
      <Chart kind="İTKİ (N)" xMax={xMax} series={[{ label: "N", color: "#7dff6a", points: thr }]} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function Timeline() {
  const result = useStore((s) => s.result);
  const simTime = useStore((s) => s.simTime);
  const setSimTime = useStore((s) => s.setSimTime);
  const trackRef = useRef<HTMLDivElement>(null);

  if (!result) return (
    <div className="timeline-empty">
      <strong>Olay akışı</strong>
      Fırlatma sonrası kademe ayrımı, paraşüt ve iniş olayları burada listelenir.
    </div>
  );
  const events: FlightEvent[] = result.events;
  const end = result.telemetry[result.telemetry.length - 1].t;

  // İz üzerinde sürükleyerek arama — tıklanan yatay konum saate çevrilir.
  const scrubFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setSimTime(frac * end);
  };
  const onScrubDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    scrubFromClientX(e.clientX);
    trackRef.current?.setPointerCapture(e.pointerId);
  };
  const onScrubMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0) scrubFromClientX(e.clientX);
  };

  return (
    <div className="timeline">
      <div
        ref={trackRef}
        className="timeline-track"
        style={{ position: "relative" }}
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
      >
        {events.map((e, i) => {
          const pct = (e.t / Math.max(end, 1e-6)) * 100;
          return (
            <button
              key={i}
              className={`tl-dot ${e.id === "crash" || e.id === "shred" || e.id === "abort" ? "bad" : ""} ${simTime >= e.t - 0.01 ? "past" : ""}`}
              style={{ left: `${pct}%` }}
              title={`${e.t.toFixed(1)}s — ${eventLabel(e.id)}`}
              aria-label={`${e.t.toFixed(1)}s — ${eventLabel(e.id)}`}
              onClick={() => setSimTime(e.t)}
            />
          );
        })}
        <div className="timeline-progress" style={{ width: `${(simTime / Math.max(end, 1e-6)) * 100}%` }} />
      </div>
      <div className="timeline-list">
        {events.map((e, i) => (
          <button
            key={i}
            className={`tl-item ${simTime >= e.t - 0.01 ? "past" : ""}`}
            onClick={() => setSimTime(e.t)}
          >
            <span className="tl-time">{e.t.toFixed(1)}s</span>
            <span className="tl-msg">{e.message}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
