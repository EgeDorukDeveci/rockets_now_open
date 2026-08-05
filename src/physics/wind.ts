// Rüzgar modeli: irtifa katmanları, wind shear, gust.
// Kaynak: model roketçilikte yaygın güç yasası profili: v(h) = v0·(h/10)^α, α ≈ 0.2-0.3
// (land breeze / atmospheric boundary layer literatürü, OpenRocket rüzgar modeli).

import { PI } from "./constants";

export interface WindState {
  /** Rüzgar vektörü (dünya koordinatları: x = menzil, y = yukarı, z = çapraz), m/s */
  vec: [number, number, number];
  /** Yer hızı, m/s */
  speed: number;
}

const ALPHA = 0.25;

/**
 * İrtifaya ve zamana bağlı rüzgar vektörü.
 * @param speed0 yer seviyesi rüzgar hızı (m/s), tipik 10 m yükseklik referansı
 * @param direction radyan cinsinden yön (0 = +x ekseni)
 * @param h irtifa (m)
 * @param t simülasyon zamanı (gust için)
 */
export function windAt(speed0: number, direction: number, h: number, t: number): WindState {
  if (speed0 <= 0.01) return { vec: [0, 0, 0], speed: 0 };
  const hRef = Math.max(h, 0.1);
  // Güç yasası profili
  const profile = speed0 * Math.pow(hRef / 10, ALPHA) * Math.min(1, hRef / 12 + 0.05);
  // Wind shear: katman sınırlarında yumuşak geçiş (11 km'de jet akımına benzer tepe)
  const shear = 1 + 0.25 * Math.exp(-Math.pow((h - 9000) / 1500, 2));
  // Gust: düşük frekanslı salınım, irtifayla büyür
  const gustAmp = 0.5 * Math.min(1, hRef / 200);
  const gust = Math.sin(t * 0.6 + hRef * 0.01) * gustAmp + Math.sin(t * 1.7) * gustAmp * 0.5;
  const speed = profile * shear + gust;
  const dx = Math.cos(direction);
  const dz = Math.sin(direction);
  return { vec: [speed * dx, 0, speed * dz], speed };
}

export function degToRad(d: number): number {
  return (d * PI) / 180;
}
