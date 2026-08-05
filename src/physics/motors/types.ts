// Motor modelleri — ortak tipler ve fabrikalar.
// Sıvı motor Isp değerleri (kaynak: SpaceX Merlin 1D 282 sl / 311 vakum,
// RL-10/RS-25 LOX/LH2 366 sl / 452 vakum, Raptor LOX/CH4 330 sl / 380 vakum).

import { G0 } from "../constants";
import { GrainGeometry, ThrustPoint, generateThrustCurve } from "./curve";

export type MotorTypeId =
  | "blackPowder"
  | "apcp"
  | "liquidLoxRp1"
  | "liquidLoxLh2"
  | "liquidLoxCh4"
  | "hybrid"
  | "coldGas";

export interface MotorSpec {
  /** Benzersiz kimlik (kod), ör. "C6-7" */
  id: string;
  name: string;
  type: MotorTypeId;
  /** Toplam itki, N·s */
  totalImpulse: number;
  /** Yanma süresi, s */
  burnTime: number;
  /** Isp, s */
  isp: number;
  /** Vakum Isp'si (sıvılar için; katıda = isp) */
  ispVacuum: number;
  /** Motor toplam kütlesi, kg (yakıt dahil) */
  mass: number;
  /** Yakıt kütlesi, kg */
  propellant: number;
  /** Gecikme süresi, s (eject charge; apogee algılama varsa None) */
  delay: number;
  /** Dış çap, m */
  diameter: number;
  /** Motor boyu, m */
  length: number;
  /** Fiyat, ₺ */
  price: number;
  /** Tanecik geometrisi (katı) */
  grain?: GrainGeometry;
  /** Kısma (throttle) yapılabilir mi (sıvı/hibrit) */
  throttleable: boolean;
  /** APCP kısmı için sınıf adı (A..K) */
  classLabel?: string;
  /** Notlar / kaynak */
  source: string;
}

export interface ThrottleControl {
  /** 0-1 kısma oranı (sıvı/hibrit) */
  throttle: number;
}

/** Altimetre/aviyonik tabanlı tetikleme (gecikme yükü yoksa). */
export type RecoveryTrigger = "delay" | "apogee" | "timer";

/**
 * Motorun itki eğrisini üretir.
 * - Katı: tanecik geometrisine göre
 * - Sıvı: sabit itki (kısma ile orantılı), burnTime = m_prop/mdot
 * - Hibrit: nötr + hafif regresif
 */
export function motorThrustCurve(spec: MotorSpec): ThrustPoint[] {
  switch (spec.type) {
    case "blackPowder":
      return generateThrustCurve({
        totalImpulse: spec.totalImpulse,
        burnTime: spec.burnTime,
        grain: "endBurn",
        ignitionPeak: 2.0,
        neutrality: 0.8,
      });
    case "apcp":
      return generateThrustCurve({
        totalImpulse: spec.totalImpulse,
        burnTime: spec.burnTime,
        grain: spec.grain ?? "bates",
        ignitionPeak: 1.4,
        neutrality: 0.75,
      });
    case "liquidLoxRp1":
    case "liquidLoxLh2":
    case "liquidLoxCh4":
      return generateThrustCurve({
        totalImpulse: spec.totalImpulse,
        burnTime: spec.burnTime,
        grain: "endBurn",
        ignitionPeak: 1.05,
        neutrality: 1,
      });
    case "hybrid":
      return generateThrustCurve({
        totalImpulse: spec.totalImpulse,
        burnTime: spec.burnTime,
        grain: "finocyl",
        ignitionPeak: 1.2,
        neutrality: 0.9,
      });
    case "coldGas":
      return generateThrustCurve({
        totalImpulse: spec.totalImpulse,
        burnTime: spec.burnTime,
        grain: "endBurn",
        ignitionPeak: 1.3,
        neutrality: 0.9,
      });
  }
}

/** İtki eğrisini kısma oranına göre yeniden ölçekler (sıvı/hibrit). */
export function applyThrottle(curve: ThrustPoint[], throttle: number): ThrustPoint[] {
  if (throttle >= 1) return curve;
  return curve.map((p) => ({ t: p.t, F: p.F * throttle }));
}

/** Sıvı/katı motor için rakıma göre Isp (vakum değerine doğru yükselir). */
export function ispAtAltitude(spec: MotorSpec, pressureRatio: number): number {
  // pressureRatio = P(h)/P0; vakuma doğru Isp artışı basınç oranıyla.
  return spec.isp + (spec.ispVacuum - spec.isp) * (1 - pressureRatio);
}

/** Motor kütlesi için yakıt dışı (kuru) kısım. */
export function dryMass(spec: MotorSpec): number {
  return Math.max(spec.mass - spec.propellant, spec.mass * 0.15);
}

/** Ortalama itki (motor kodu hesabı için): I_tot / burnTime. */
export function averageThrust(spec: MotorSpec): number {
  return spec.totalImpulse / Math.max(spec.burnTime, 1e-6);
}

/** Motor kodunu üret: "C6-7" biçimi (sınıf + ortalama itki + gecikme). */
export function motorCode(classLabel: string | undefined, avgThrustN: number, delay: number): string {
  if (!classLabel) return "";
  const t = Math.round(avgThrustN);
  return `${classLabel}${t}-${Math.round(delay)}`;
}

/** Toplam itkiden sınıf adı (NAR tablosu). Kaynak: nar.org. */
export function classFromImpulse(it: number): string {
  if (it < 0.3126) return "1/8A";
  if (it <= 0.625) return "1/4A";
  if (it <= 1.25) return "1/2A";
  if (it <= 2.5) return "A";
  if (it <= 5.0) return "B";
  if (it <= 10.0) return "C";
  if (it <= 20.0) return "D";
  if (it <= 40.0) return "E";
  if (it <= 80.0) return "F";
  if (it <= 160.0) return "G";
  if (it <= 320.0) return "H";
  if (it <= 640.0) return "I";
  if (it <= 1280.0) return "J";
  if (it <= 2560.0) return "K";
  if (it <= 5120.0) return "L";
  if (it <= 10240.0) return "M";
  if (it <= 20480.0) return "N";
  return "O";
}

/** Kullanıcı için doğrulama sabiti: g0·Isp ile teorik delta-v. */
export function tsiolkovsky(isp: number, m0: number, mf: number): number {
  return isp * G0 * Math.log(m0 / Math.max(mf, 1e-9));
}
