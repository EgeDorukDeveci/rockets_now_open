// Fizik sabitleri — kaynak: CODATA / ISA-1976 standart atmosferi.
// Birimler SI (m, kg, s, N, Pa).

/** Standart yerçekimi ivmesi, m/s² (CODATA, g0 = 9.80665). */
export const G0 = 9.80665;

/** Dünya yarıçapı, m (WGS-84 ortalama yarıçap 6371.0 km). */
export const EARTH_RADIUS = 6_371_000;

/** Kuru hava özgül gaz sabiti, J/(kg·K) (ISA-1976, R = 287.053). */
export const R_AIR = 287.053;

/** Hava için ısı kapasiteleri oranı gamma (ISA-1976). */
export const GAMMA_AIR = 1.4;

/** Deniz seviyesi sıcaklığı, K (ISA-1976). */
export const T0 = 288.15;

/** Deniz seviyesi basıncı, Pa (ISA-1976). */
export const P0 = 101325;

/** Deniz seviyesi hava yoğunluğu, kg/m³ (ISA-1976). */
export const RHO0 = 1.225;

/** Ses hızı (deniz seviyesi), m/s = sqrt(gamma·R·T0). */
export const A0 = Math.sqrt(GAMMA_AIR * R_AIR * T0);

/** Troposfer sıcaklık lapse oranı, K/m (ISA-1976, 6.5 K/km). */
export const LAPSE_TROP = 0.0065;

/** Pi'ye dayalı sık kullanılanlar. */
export const PI = Math.PI;
export const TWO_PI = 2 * Math.PI;

/** derece -> radyan */
export function deg2rad(deg: number): number {
  return (deg * PI) / 180;
}

/** radyan -> derece */
export function rad2deg(rad: number): number {
  return (rad * 180) / PI;
}

/** Uzaklık dönüşümü: inç -> m (1 in = 0.0254 m). */
export const IN_TO_M = 0.0254;
