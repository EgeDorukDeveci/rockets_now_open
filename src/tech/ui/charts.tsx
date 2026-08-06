// Teknik mod paylaşılan canvas grafik yardımcıları (HudPanel deseninden).

import { useEffect, useRef } from "react";

export interface Series {
  label: string;
  color: string;
  points: Array<[number, number]>;
}

export function drawChart(
  canvas: HTMLCanvasElement,
  series: Series[],
  xMax: number,
  opts: { yMax?: number; xLabel?: string; yLabel?: string } = {}
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

  const padL = 38;
  const padB = 18;
  const padT = 8;
  const plotW = w - padL - 8;
  const plotH = h - padB - padT;

  let yMax = opts.yMax ?? 0;
  let yMin = 0;
  if (opts.yMax === undefined) {
    for (const s of series) {
      for (const [, v] of s.points) {
        if (Math.abs(v) > yMax) yMax = Math.abs(v);
        if (v < yMin) yMin = v;
      }
    }
  }
  if (yMax === 0) yMax = 1;
  const span = yMax - Math.min(yMin, 0);

  ctx.strokeStyle = "#1c2736";
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - 8, y);
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

    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(X(s.points[0][0]), Y(s.points[0][1]));
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(X(s.points[i][0]), Y(s.points[i][1]));
    ctx.stroke();
  }
}

function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

/** Bir canvas'a veri serisini çizen hook; seri/xMax değişince yeniden çizer. */
export function useChart(series: Series[], xMax: number, opts: { yMax?: number } = {}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawChart(ref.current, series, xMax, opts);
  }, [series, xMax, opts.yMax]);
  return ref;
}

export function Chart({ title, series, xMax, height = 130 }: {
  title: string;
  series: Series[];
  xMax: number;
  height?: number;
}) {
  const ref = useChart(series, xMax);
  return (
    <div className="chart">
      <div className="chart-title">{title}</div>
      <canvas ref={ref} style={{ width: "100%", height }} />
    </div>
  );
}
