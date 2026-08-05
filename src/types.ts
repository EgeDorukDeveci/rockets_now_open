// Tasarım yapılandırması — tüm bileşen tipleri.
// Birimler SI; sadece gösterim m/km (doküman §8).

import { GrainGeometry } from "./physics/motors/curve";
import { LiquidFuel, MotorClass } from "./physics/motors/catalog";
import { NoseProfileId } from "./physics/noseShapes";

export interface BodyConfig {
  /** Uzunluk, m (0.1 - 3) */
  lengthM: number;
  /** Dış çap, m (0.01 - 0.15) */
  diameterM: number;
  /** Cidar kalınlığı, m (0.0005 - 0.01) */
  wallM: number;
  /** Malzeme id (MATERIALS) */
  material: string;
  /** Boya/kaplama (kütle + Cd küçük etki) */
  paint: boolean;
  /** Motor montaj borusu çapı, m (varsa) */
  mountTubeM: number;
}

export interface NoseConfig {
  profile: NoseProfileId;
  /** İncelik: uzunluk/gövde çapı (1-5 kalibre) */
  lengthCalibers: number;
  material: string;
  /** İçi boş mu (kütle farkı) */
  hollow: boolean;
  powerN: number;
  bluntness: number;
}

export type FinGeometryId =
  | "rectangular"
  | "swept"
  | "clippedDelta"
  | "elliptical"
  | "delta"
  | "rounded";

export type FinAirfoil = "flat" | "wedge" | "rounded";

export interface FinConfig {
  count: 0 | 3 | 4 | 5 | 6;
  geometry: FinGeometryId;
  /** Kök kiriş, m */
  rootChordM: number;
  /** Uç kiriş, m */
  tipChordM: number;
  /** Yarı açıklık, m */
  semispanM: number;
  /** Tarama açısı, derece (dikeyden geriye) */
  sweepDeg: number;
  /** Burun ucundan kök kiriş ön kenarı mesafesi, m */
  xPosM: number;
  /** Yalpa (cant) açısı, derece 0-5 */
  cantDeg: number;
  airfoil: FinAirfoil;
  material: string;
  /** Kanat kalınlığı, m */
  thicknessM: number;
}

export type MotorChoice =
  | { kind: "estes"; id: string; count: number }
  | { kind: "apcp"; cls: MotorClass; avgThrustN: number; delay: number; impulsePct: number; grain: GrainGeometry; count: number }
  | { kind: "liquid"; fuel: LiquidFuel; name: string; thrustN: number; propMassKg: number; dryFraction: number; count: number }
  | { kind: "hybrid"; thrustN: number; propMassKg: number; count: number }
  | { kind: "coldGas"; thrustN: number; propMassKg: number; count: number };

export interface MotorConfig {
  choice: MotorChoice;
  /** Kısma 0-1 (sıvı/hibrit) */
  throttle: number;
}

export type RecoveryType = "parachute" | "streamer" | "tumble" | "none";
export type RecoveryTrigger = "delay" | "apogee" | "timer";

export interface RecoveryConfig {
  type: RecoveryType;
  /** Paraşüt çapı, m (0.2 - 3) */
  diameterM: number;
  /** Kanopi malzemesi (CANOPY_MATERIALS) */
  material: string;
  trigger: RecoveryTrigger;
  /** Timer tetikliyse saniye */
  timerSeconds: number;
  /** Şok ipi uzunluğu, m */
  shockCordM: number;
  /** Çift sistem: drogue çapı, m (0 = yok) */
  drogueDiaM: number;
}

export type AvionicsId = "none" | "altimeter" | "barometer" | "gps" | "flightComputer";

export interface PayloadConfig {
  hasPayload: boolean;
  /** Yük kütlesi, kg */
  cargoKg: number;
  avionics: AvionicsId;
}

export interface StageConfig {
  body: BodyConfig;
  nose: NoseConfig;
  fins: FinConfig;
  motor: MotorConfig;
  recovery: RecoveryConfig;
  payload: PayloadConfig;
  /** Üst kademe ayrımı: hot (üst motor ayrım anında ateşlenir) / cold */
  separation: "hot" | "cold";
}

export interface RocketConfig {
  name: string;
  stages: StageConfig[];
  /** Paralel güçlendirici sayısı (0, 2, 4) */
  boosterCount: 0 | 2 | 4;
  boosterMotor: MotorConfig;
  /** Rüzgar hızı, m/s */
  windMps: number;
  /** Rüzgar yönü, derece (0 = kuzey/buradan uzağa) */
  windDeg: number;
  /** Fırlatma rayı, m */
  railM: number;
  /** Ray açısı (dikeyden), derece */
  railTiltDeg: number;
  /** Entegrasyon adımı, s */
  dt: number;
}

export function defaultStage(): StageConfig {
  return {
    body: { lengthM: 0.4, diameterM: 0.025, wallM: 0.001, material: "kraft", paint: false, mountTubeM: 0.018 },
    nose: { profile: "tangentOgive", lengthCalibers: 2, material: "kraft", hollow: true, powerN: 0.5, bluntness: 0.1 },
    fins: {
      count: 3,
      geometry: "rectangular",
      rootChordM: 0.08,
      tipChordM: 0.06,
      semispanM: 0.045,
      sweepDeg: 0,
      xPosM: 0.25,
      cantDeg: 0,
      airfoil: "flat",
      material: "balsa",
      thicknessM: 0.003,
    },
    motor: { choice: { kind: "estes", id: "C6-7", count: 1 }, throttle: 1 },
    recovery: {
      type: "parachute",
      diameterM: 0.3,
      material: "plastic",
      trigger: "delay",
      timerSeconds: 2,
      shockCordM: 0.6,
      drogueDiaM: 0,
    },
    payload: { hasPayload: false, cargoKg: 0, avionics: "none" },
    separation: "hot",
  };
}

export function defaultConfig(): RocketConfig {
  return {
    name: "Özel Roket",
    stages: [defaultStage()],
    boosterCount: 0,
    boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
    windMps: 3,
    windDeg: 0,
    railM: 1.2,
    railTiltDeg: 0,
    dt: 0.01,
  };
}
