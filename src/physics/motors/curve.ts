// Motor itki-zaman eğrisi üretimi.
// Katı motor tanecik (grain) geometrileri yanma alanını belirler → itki şekli:
//  - end-burn:   sabit alan → nötr (Estes black powder tipik)
//  - bates:      silindirik çekirdek → progressive (alan artar)
//  - star:       6 kollu yıldız → nötr
//  - finocyl:    progresif sonra regresif
// Kaynak: Sutton, "Rocket Propulsion Elements"; nakka-rocketry.net (grain geometry).
// İtki, Isp ve kütle akışı: F = mdot·Isp·g0 (Tsiolkovsky/roket denklemi temeli).

import { G0 } from "../constants";

export type GrainGeometry = "endBurn" | "bates" | "star" | "finocyl";

export interface ThrustPoint {
  t: number; // s
  F: number; // N
}

export interface MotorCurveInput {
  /** Toplam itki, N·s */
  totalImpulse: number;
  /** Yanma süresi, s */
  burnTime: number;
  /** Tanecik geometrisi (katı için) */
  grain?: GrainGeometry;
  /** Başlangıç itki sivri tepe oranı (black powder'da belirgin) */
  ignitionPeak?: number;
  /** Nötr eğri düzgünlüğü (0-1) */
  neutrality?: number;
}

/** Normalize yanma kesri t∈[0,1] → normalize itki F∈[0,~2] (ortalama 1). */
export function grainShape(grain: GrainGeometry, t: number, neutrality = 0.9): number {
  let base: number;
  switch (grain) {
    case "endBurn":
      // nötr: hafif progresif
      base = 0.9 + 0.25 * t;
      break;
    case "bates":
      // silindirik çekirdek dışa yanar: alan ∝ (r0 + burnrate·t) → progressive
      base = 0.55 + 1.1 * t;
      break;
    case "star":
      // yıldız: genelde hafif regresif
      base = 1.1 - 0.25 * t;
      break;
    case "finocyl":
      // ilk progresif, sonra regresif
      base = 0.5 + 1.5 * t - 1.0 * t * t;
      break;
    default:
      base = 1.0;
  }
  // Nötrlük ayarı: şekli 1.0'a doğru yumuşat
  const shaped = 1.0 + (base - 1.0) * neutrality;
  return Math.max(shaped, 0.05);
}

/**
 * Grain geometrisi + toplam itkiden gerçekçi itki-zaman eğrisi üretir.
 * - İgnisyon darbesi: ilk %3'lük dilimde ~1.8× tepe
 * - Yanma sonu: son %6'lık dilimde doğrusal sönüm
 * - İtki integrali verilen toplam itkiye normalize edilir.
 */
export function generateThrustCurve(input: MotorCurveInput): ThrustPoint[] {
  const { totalImpulse, burnTime, grain = "endBurn", ignitionPeak = 1.9, neutrality = 0.85 } = input;
  const n = 60;
  const pts: ThrustPoint[] = [];
  const dt = burnTime / n;
  let rawSum = 0;
  const raw: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * burnTime;
    const f = t / burnTime;
    let shape = grainShape(grain, f, neutrality);
    if (f < 0.035) {
      // ignisyon sivri tepesi: hızlı yükselme
      shape = shape * (1 + (ignitionPeak - 1) * Math.max(0, 1 - f / 0.035));
    } else if (f > 0.94) {
      // tail-off
      shape = shape * Math.max(0, 1 - (f - 0.94) / 0.06);
    }
    raw.push(shape);
    if (i > 0) rawSum += ((raw[i - 1] + shape) / 2) * dt;
  }
  const scale = totalImpulse / Math.max(rawSum, 1e-9);
  for (let i = 0; i <= n; i++) {
    pts.push({ t: i * dt, F: raw[i] * scale });
  }
  return pts;
}

/** İtki eğrisinden anlık itki (doğrusal interpolasyon). */
export function thrustAt(curve: ThrustPoint[], t: number): number {
  if (curve.length === 0) return 0;
  if (t <= curve[0].t) return curve[0].F;
  const last = curve[curve.length - 1];
  if (t >= last.t) return 0;
  // ikili arama
  let lo = 0;
  let hi = curve.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = curve[lo];
  const b = curve[hi];
  const f = (t - a.t) / Math.max(b.t - a.t, 1e-9);
  return a.F + (b.F - a.F) * f;
}

/** Bir eğrinin toplam itkisini (trapez) hesapla — doğrulama için. */
export function curveTotalImpulse(curve: ThrustPoint[]): number {
  let sum = 0;
  for (let i = 1; i < curve.length; i++) {
    sum += ((curve[i - 1].F + curve[i].F) / 2) * (curve[i].t - curve[i - 1].t);
  }
  return sum;
}

/** Toplam itki ve Isp'den yakıt kütlesi: m_prop = It / (Isp·g0). */
export function propellantMass(totalImpulse: number, isp: number): number {
  return totalImpulse / (isp * G0);
}
