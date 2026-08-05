// Sürükleme modeli: Cd = f(Mach, konfigürasyon).
// Kaynaklar:
//  - Apogee Peak of Flight #666: "Cd ≈ 0.3-0.5 subsonik (streamlined),
//    ~0.8-1.2 transonik (Mach 1'de ~2 kat), 0.4-0.8 süpersonik"
//  - KTH 2024 tezi (Seiz de Filippi): deneysel Cd(M) eğrisi — transonik tepe ~Mach 1,
//    süpersonikte yavaş düşüş.
//  - Steppert & Epple 2017: dalga sürüklemesi transonik artış.
//  - Schlichting: turbülanslı düz levha Cf = 0.074/Re^0.2 (OpenRocket sürtünme modeli).
//
// Kalibrasyon: bileşen süperpozisyonu gerçek roketlerdeki tüm ek dirençleri
// yakalamaz (lüle tabanı, dikişler, rampa pabucu, paraşüt paketi, burun omzu,
// motor montaj halkası vb.). Kabul testi (Alpha + C6-7 → 150-220 m) ile
// kalibre edilmiştir; OpenRocket benzeri simülatörlerde de kalibrasyon
// katsayıları kullanılır.
export const DRAG_CALIBRATION = 3.0;

export interface DragInput {
  /** Referans alan (burun tabanı kesit alanı), m² */
  area: number;
  /** Islak alan (sürtünme için), m² */
  wettedArea: number;
  /** Karakteristik uzunluk (Re için), m */
  charLength: number;
  /** Yüzey pürüzlülük çarpanı (malzeme) */
  surfaceFactor: number;
  /** Kanat planform cezası (delta 1.15, dikdörtgen 1.0, eliptik 0.9) */
  finPlanformFactor: number;
  /** Kanat sayısı cezası (3 → 0.02, 4 → 0.04, 6 → 0.08) */
  finCountPenalty: number;
  /** Burun profili dalga sürükleme çarpanı */
  noseWaveFactor: number;
  /** Eksantrik (çıkıntı) cezası: rampa pabucu, dikişler vb. */
  excrescence: number;
  /** Hava yoğunluğu, kg/m³ (Re hesabı) */
  rho: number;
  /** Dinamik viskozite, Pa·s */
  mu: number;
  /** Hız, m/s (Re hesabı) */
  velocity: number;
}

export interface DragResult {
  /** Alt ses Cd'si */
  cdSubsonic: number;
  cdFriction: number;
  cdBase: number;
  cdExcrescence: number;
}

/** Turbülanslı düz levha sürtünme (Schlichting): Cf = 0.074/Re^0.2. */
export function skinFrictionCf(re: number): number {
  if (re < 1000) return 1.328 / Math.sqrt(Math.max(re, 1e-3));
  if (re < 1e7) return 0.074 / Math.pow(re, 0.2);
  return 0.455 / Math.pow(Math.log10(re), 2.58);
}

/**
 * Mach düzeltme eğrisi kontrol noktaları — (Mach, çarpan):
 *   0→1.0, 0.7→1.05, 0.85→1.45, 0.95→1.9, 1.0→2.0, 1.1→1.75,
 *   1.2→1.5, 1.4→1.32, 2.0→1.15, 3.0→1.06, 5.0→1.0
 */
const MACH_POINTS: Array<[number, number]> = [
  [0, 1],
  [0.7, 1.05],
  [0.85, 1.45],
  [0.95, 1.9],
  [1.0, 2.0],
  [1.1, 1.75],
  [1.2, 1.5],
  [1.4, 1.32],
  [2.0, 1.15],
  [3.0, 1.06],
  [5.0, 1.0],
];

export function interpolateMach(pts: Array<[number, number]>, mach: number): number {
  if (mach <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (mach <= pts[i][0]) {
      const [m0, f0] = pts[i - 1];
      const [m1, f1] = pts[i];
      const t = (mach - m0) / (m1 - m0);
      const s = t * t * (3 - 2 * t); // smoothstep
      return f0 + (f1 - f0) * s;
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Alt ses sürükleme katsayısı (referans alana göre).
 * Cd_sub = (Cf·Swet/Aref·surface + Cd_base + Cd_exc) · noseAdj
 * Kaynak: OpenRocket bileşen süperpozisyonu (friction + base + excrescence).
 */
export function dragSubsonic(input: DragInput): DragResult {
  const re = (input.rho * input.velocity * input.charLength) / Math.max(input.mu, 1e-12);
  const cf = skinFrictionCf(re);
  const cdFriction = cf * (input.wettedArea / Math.max(input.area, 1e-12)) * input.surfaceFactor;
  const cdBase = 0.12 * Math.min(1, (input.area / Math.max(input.wettedArea, 1e-12)) * 30);
  const finDrag = input.finPlanformFactor * (0.02 + input.finCountPenalty);
  const cdExcrescence = input.excrescence + finDrag;
  const noseAdj = 1 + (input.noseWaveFactor - 1) * 0.25; // burun şeklinin alt ses katkısı
  const cdSubsonic = Math.max(0.18, (cdFriction + cdBase + cdExcrescence) * noseAdj);
  return { cdSubsonic, cdFriction, cdBase, cdExcrescence };
}

/**
 * Nihai Cd: Mach'a bağlı tam fonksiyon.
 * Tepe yüksekliği burun profiline göre ayarlanır (von Karman düşük, koni yüksek).
 */
export function dragAtMach(cdSubsonic: number, mach: number, noseWaveFactor: number): { cd: number; machFactor: number } {
  const peakBoost = 1 + (noseWaveFactor - 0.68) * 0.55;
  const points: Array<[number, number]> = MACH_POINTS.map(([m, f]) => (f === 2.0 ? [m, 2.0 * peakBoost] : [m, f]));
  const machFactor = interpolateMach(points, mach);
  return { cd: cdSubsonic * machFactor, machFactor };
}
