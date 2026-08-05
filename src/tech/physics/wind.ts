// Rüzgar modelleri: ortalama (sabit) ve çok seviyeli (yükseklikle doğrusal
// interpolasyon). Yön vektörü: derece → (x,y) bileşenler, N=90°/E=0°.

import { TechConditions } from "../model";

export interface WindVector {
  /** m/s, doğu pozitif */
  x: number;
  /** m/s, kuzey pozitif */
  y: number;
}

/** Yükseklikteki rüzgar hızı, m/s. */
export function windAt(altitudeM: number, c: TechConditions): number {
  if (c.windModel !== "multilevel" || c.windLevels.length === 0) {
    return c.windSpeedMps;
  }
  const levels = [...c.windLevels].sort((a, b) => a.altitudeM - b.altitudeM);
  if (altitudeM <= levels[0].altitudeM) return levels[0].speedMps;
  const last = levels[levels.length - 1];
  if (altitudeM >= last.altitudeM) return last.speedMps;
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i];
    const b = levels[i + 1];
    if (altitudeM >= a.altitudeM && altitudeM <= b.altitudeM) {
      const f = (altitudeM - a.altitudeM) / Math.max(b.altitudeM - a.altitudeM, 1e-9);
      return a.speedMps + f * (b.speedMps - a.speedMps);
    }
  }
  return last.speedMps;
}

/** Yükseklikteki rüzgar yönü, derece. */
export function windDirectionAt(altitudeM: number, c: TechConditions): number {
  if (c.windModel !== "multilevel" || c.windLevels.length === 0) {
    return c.windDirectionDeg;
  }
  const levels = [...c.windLevels].sort((a, b) => a.altitudeM - b.altitudeM);
  if (altitudeM <= levels[0].altitudeM) return levels[0].directionDeg;
  const last = levels[levels.length - 1];
  if (altitudeM >= last.altitudeM) return last.directionDeg;
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i];
    const b = levels[i + 1];
    if (altitudeM >= a.altitudeM && altitudeM <= b.altitudeM) {
      const f = (altitudeM - a.altitudeM) / Math.max(b.altitudeM - a.altitudeM, 1e-9);
      return a.directionDeg + f * (b.directionDeg - a.directionDeg);
    }
  }
  return last.directionDeg;
}

/** Rüzgar vektörü (x=doğu, y=kuzey). */
export function windVectorAt(altitudeM: number, c: TechConditions): WindVector {
  const speed = windAt(altitudeM, c);
  const dir = windDirectionAt(altitudeM, c) * (Math.PI / 180);
  return { x: speed * Math.sin(dir), y: speed * Math.cos(dir) };
}

/** Ortalama rüzgar destek/standart sapma kaçışı (rastgelelik için). */
export function windStdDevAt(altitudeM: number, c: TechConditions): number {
  if (c.windModel !== "multilevel" || c.windLevels.length === 0) return c.windStdDev;
  const levels = [...c.windLevels].sort((a, b) => a.altitudeM - b.altitudeM);
  const last = levels[levels.length - 1];
  for (let i = 0; i < levels.length; i++) {
    if (altitudeM <= levels[i].altitudeM) return levels[i].stdDev;
  }
  return last.stdDev;
}