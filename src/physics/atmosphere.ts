// Standart atmosfer modeli (ISA-1976).
// Kaynak: U.S. Standard Atmosphere 1976, NOAA/NASA/USAF.
// Katmanlar: 0-11 km (lapse -6.5 K/km), 11-20 km (izotermal 216.65 K),
// 20-32 km (+1 K/km), 32-47 km (+2.8 K/km), 47-51 km (izotermal), 51-86 km (-2 K/km).

import { G0, GAMMA_AIR, LAPSE_TROP, P0, R_AIR, T0 } from "./constants";

export interface AtmosphereState {
  /** Sıcaklık, K */
  T: number;
  /** Basınç, Pa */
  P: number;
  /** Yoğunluk, kg/m³ */
  rho: number;
  /** Ses hızı, m/s */
  a: number;
  /** Dinamik viskozite, Pa·s (Sutherland) */
  mu: number;
}

// Katman tablosu: [üst sınır h (m), lapse oranı (K/m)]
// Lapse negatif: sıcaklık artar (izotermal için 0).
const LAYERS: ReadonlyArray<{ top: number; lapse: number }> = [
  { top: 11_000, lapse: -LAPSE_TROP }, // troposfer
  { top: 20_000, lapse: 0 }, // stratosfer tabanı (izotermal)
  { top: 32_000, lapse: 0.001 }, // +1 K/km
  { top: 47_000, lapse: 0.0028 }, // +2.8 K/km
  { top: 51_000, lapse: 0 }, // izotermal
  { top: 86_000, lapse: -0.002 }, // mezosfer
];

// Katmanlar arası taban noktalarını statik olarak hesapla.
interface LayerBase {
  h: number; // alt sınır irtifası
  T: number; // alt sınır sıcaklığı
  P: number; // alt sınır basıncı
  lapse: number; // bu katmandaki lapse oranı
}

function buildBases(): LayerBase[] {
  const bases: LayerBase[] = [{ h: 0, T: T0, P: P0, lapse: LAYERS[0].lapse }];
  let h = 0;
  let T = T0;
  let P = P0;
  for (let i = 0; i < LAYERS.length; i++) {
    const top = LAYERS[i].top;
    const lapse = LAYERS[i].lapse;
    if (top > h) {
      const delta = top - h;
      const T_top = T + lapse * delta;
      let P_top: number;
      if (Math.abs(lapse) < 1e-12) {
        P_top = P * Math.exp((-G0 * delta) / (R_AIR * T));
      } else {
        P_top = P * Math.pow(T_top / T, -G0 / (R_AIR * lapse));
      }
      h = top;
      T = T_top;
      P = P_top;
      if (i + 1 < LAYERS.length) {
        bases.push({ h, T, P, lapse: LAYERS[i + 1].lapse });
      }
    }
  }
  return bases;
}

const BASES = buildBases();

/** Sutherland viskozite yasası (ISA-1976): mu = mu0·(T/T0)^1.5·(T0+S)/(T+S). */
export function viscosity(T: number): number {
  const S = 110.4;
  const mu0 = 1.716e-5;
  return (mu0 * Math.pow(T / T0, 1.5) * (T0 + S)) / (T + S);
}

/** Belirtilen geometrik irtifada ISA-1976 atmosfer durumu. */
export function atmosphere(h: number): AtmosphereState {
  const hc = Math.max(h, -1000); // yeraltı senaryosu için taban değer
  let base = BASES[BASES.length - 1];
  for (const b of BASES) {
    if (hc >= b.h) base = b;
    else break;
  }
  // Katman seçimi zaten doğru tabanı bulur; delta sadece tabandan yukarı doğrudur.
  // (Eski clamp: negatif lapse'li katmanda (11_000 - base.h) ile kapatınca mezosferde
  //  delta hep -40000 oldu → T=350 K / P≈5000 Pa saçmalığı üretiyordu.)
  const delta = Math.max(hc - base.h, 0);
  let T = base.T + base.lapse * delta;
  let P: number;
  if (Math.abs(base.lapse) < 1e-12) {
    P = base.P * Math.exp((-G0 * delta) / (R_AIR * base.T));
  } else {
    T = Math.max(T, 100);
    P = base.P * Math.pow(T / base.T, -G0 / (R_AIR * base.lapse));
  }
  const rho = P / (R_AIR * T);
  const a = Math.sqrt(GAMMA_AIR * R_AIR * T);
  return { T, P, rho, a, mu: viscosity(T) };
}

/** Deniz seviyesi atmosferi (hızlı erişim). */
export const SEA_LEVEL = atmosphere(0);
