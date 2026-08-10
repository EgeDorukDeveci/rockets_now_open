// İçe aktarılan tasarım JSON'unu geçerli bir RocketConfig'e dönüştürür.
// Amaç: bozuk/eksik/limit dışı dosyaların uygulamayı çökertmesini veya
// saçma fizik üretmesini engellemek. Her sayı klamplanır, her enum
// doğrulanır, eksik alanlar varsayılanlarla doldurulur.

import { RocketConfig, StageConfig, defaultConfig, defaultStage } from "./types";
import { CANOPY_MATERIALS, FIN_MATERIALS, MATERIALS } from "./physics/materials";
import { CLASS_ORDER } from "./physics/motors/catalog";
import { NOSE_PROFILES } from "./physics/noseShapes";

const MATERIAL_IDS = new Set([...Object.keys(MATERIALS), ...Object.keys(FIN_MATERIALS)]);
const CANOPY_IDS = new Set(Object.keys(CANOPY_MATERIALS));
const NOSE_PROFILE_IDS = new Set(NOSE_PROFILES.map((p) => p.id));
const FIN_GEOMETRY_IDS = new Set(["rectangular", "swept", "clippedDelta", "elliptical", "delta", "rounded"]);
const FIN_AIRFOIL_IDS = new Set(["flat", "wedge", "rounded"]);
const RECOVERY_TYPE_IDS = new Set(["parachute", "streamer", "tumble", "none"]);
const RECOVERY_TRIGGER_IDS = new Set(["delay", "apogee", "timer"]);
const AVIONICS_IDS = new Set(["none", "altimeter", "barometer", "gps", "flightComputer"]);
const MOTOR_KIND_IDS = new Set(["estes", "apcp", "liquid", "hybrid", "coldGas"]);
const MOTOR_CLASS_IDS = new Set<string>(CLASS_ORDER);
const LIQUID_FUEL_IDS = new Set<string>(["LOX/RP-1", "LOX/LH2", "LOX/CH4"]);
const GRAIN_IDS = new Set<string>(["endBurn", "bates", "star", "finocyl"]);

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null;
}

function num(v: unknown, d: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.min(max, Math.max(min, n));
}

function oneOf(v: unknown, set: Set<string>, d: string): string {
  return typeof v === "string" && set.has(v) ? v : d;
}

function bool(v: unknown, d: boolean): boolean {
  return typeof v === "boolean" ? v : d;
}

function intNum(v: unknown, d: number, min: number, max: number): number {
  return Math.round(num(v, d, min, max));
}

/** Motor seçimini doğrula; eksik alanlar varsayılanlarla doldurulur. */
function sanitizeChoice(c: unknown): StageConfig["motor"]["choice"] {
  const o = asObj(c);
  const kind = o ? oneOf(o.kind, MOTOR_KIND_IDS, "estes") : "estes";
  const count = o ? intNum(o.count, 1, 1, 4) : 1;
  switch (kind) {
    case "estes":
      return { kind, id: typeof o?.id === "string" && o.id.length <= 20 ? o.id : "C6-7", count };
    case "apcp":
      return {
        kind,
        cls: oneOf(o?.cls, MOTOR_CLASS_IDS, "D") as "1/4A" | "1/2A" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K",
        avgThrustN: o ? num(o.avgThrustN, 20, 1, 500) : 20,
        delay: o ? num(o.delay, 5, 0, 20) : 5,
        impulsePct: o ? num(o.impulsePct, 0.5, 0, 1) : 0.5,
        grain: oneOf(o?.grain, GRAIN_IDS, "endBurn") as "endBurn" | "bates" | "star" | "finocyl",
        count,
      };
    case "liquid":
      return {
        kind,
        fuel: o ? (oneOf(o.fuel, LIQUID_FUEL_IDS, "LOX/RP-1") as "LOX/RP-1" | "LOX/LH2" | "LOX/CH4") : "LOX/RP-1",
        name: typeof o?.name === "string" && o.name.trim() ? o.name.slice(0, 40) : "Sıvı Motor",
        thrustN: o ? num(o.thrustN, 20, 1, 5000) : 20,
        propMassKg: o ? num(o.propMassKg, 0.1, 0.1, 500) : 0.1,
        dryFraction: o ? num(o.dryFraction, 0.1, 0.02, 0.5) : 0.1,
        count,
      };
    case "hybrid":
      return {
        kind,
        thrustN: o ? num(o.thrustN, 20, 1, 5000) : 20,
        propMassKg: o ? num(o.propMassKg, 0.05, 0.05, 500) : 0.05,
        count,
      };
    default: // coldGas
      return {
        kind: "coldGas",
        thrustN: o ? num(o.thrustN, 20, 1, 5000) : 20,
        propMassKg: o ? num(o.propMassKg, 0.05, 0.05, 500) : 0.05,
        count,
      };
  }
}

function sanitizeStage(raw: unknown): StageConfig {
  const d = defaultStage();
  const o = asObj(raw);
  if (!o) return d;
  const body = asObj(o.body);
  const nose = asObj(o.nose);
  const fins = asObj(o.fins);
  const motor = asObj(o.motor);
  const recovery = asObj(o.recovery);
  const payload = asObj(o.payload);
  return {
    body: {
      lengthM: num(body?.lengthM, d.body.lengthM, 0.05, 3),
      diameterM: num(body?.diameterM, d.body.diameterM, 0.01, 0.15),
      wallM: num(body?.wallM, d.body.wallM, 0.0003, 0.01),
      material: oneOf(body?.material, MATERIAL_IDS, d.body.material),
      paint: bool(body?.paint, d.body.paint),
      mountTubeM: num(body?.mountTubeM, d.body.mountTubeM, 0.005, 0.1),
    },
    nose: {
      profile: oneOf(nose?.profile, NOSE_PROFILE_IDS, d.nose.profile) as StageConfig["nose"]["profile"],
      lengthCalibers: num(nose?.lengthCalibers, d.nose.lengthCalibers, 0.5, 5),
      material: oneOf(nose?.material, MATERIAL_IDS, d.nose.material),
      hollow: bool(nose?.hollow, d.nose.hollow),
      powerN: num(nose?.powerN, d.nose.powerN, 0.1, 3),
      bluntness: num(nose?.bluntness, d.nose.bluntness, 0, 0.35),
    },
    fins: {
      count: intNum(fins?.count, d.fins.count, 0, 6) as 0 | 3 | 4 | 5 | 6,
      geometry: oneOf(fins?.geometry, FIN_GEOMETRY_IDS, d.fins.geometry) as StageConfig["fins"]["geometry"],
      rootChordM: num(fins?.rootChordM, d.fins.rootChordM, 0.01, 0.5),
      tipChordM: num(fins?.tipChordM, d.fins.tipChordM, 0, 0.5),
      semispanM: num(fins?.semispanM, d.fins.semispanM, 0.005, 0.4),
      sweepDeg: num(fins?.sweepDeg, d.fins.sweepDeg, 0, 60),
      xPosM: num(fins?.xPosM, d.fins.xPosM, 0, 3),
      cantDeg: num(fins?.cantDeg, d.fins.cantDeg, 0, 5),
      airfoil: oneOf(fins?.airfoil, FIN_AIRFOIL_IDS, d.fins.airfoil) as StageConfig["fins"]["airfoil"],
      material: oneOf(fins?.material, MATERIAL_IDS, d.fins.material),
      thicknessM: num(fins?.thicknessM, d.fins.thicknessM, 0.0005, 0.02),
    },
    motor: {
      choice: sanitizeChoice(motor?.choice),
      throttle: num(motor?.throttle, d.motor.throttle, 0.1, 1),
    },
    recovery: {
      type: oneOf(recovery?.type, RECOVERY_TYPE_IDS, d.recovery.type) as StageConfig["recovery"]["type"],
      diameterM: num(recovery?.diameterM, d.recovery.diameterM, 0.02, 3),
      material: oneOf(recovery?.material, CANOPY_IDS, d.recovery.material),
      trigger: oneOf(recovery?.trigger, RECOVERY_TRIGGER_IDS, d.recovery.trigger) as StageConfig["recovery"]["trigger"],
      timerSeconds: num(recovery?.timerSeconds, d.recovery.timerSeconds, 0, 120),
      shockCordM: num(recovery?.shockCordM, d.recovery.shockCordM, 0, 5),
      drogueDiaM: num(recovery?.drogueDiaM, d.recovery.drogueDiaM, 0, 1),
    },
    payload: {
      hasPayload: bool(payload?.hasPayload, d.payload.hasPayload),
      cargoKg: num(payload?.cargoKg, d.payload.cargoKg, 0, 50),
      avionics: oneOf(payload?.avionics, AVIONICS_IDS, d.payload.avionics) as StageConfig["payload"]["avionics"],
    },
    separation: oneOf(o.separation, new Set(["hot", "cold"]), d.separation) as StageConfig["separation"],
  };
}

/** Booster sayısını geçerli kümeye çeker: 0 | 2 | 4. */
function boosterCountOf(v: unknown, d: 0 | 2 | 4): 0 | 2 | 4 {
  if (v === 0 || v === 2 || v === 4) return v;
  return d;
}

/** Geçersiz/güvenilmez içe aktarma girdisini tam geçerli bir RocketConfig'e çevirir. */
export function sanitizeConfig(input: unknown): RocketConfig {
  const d = defaultConfig();
  const o = asObj(input);
  if (!o) return d;
  const rawStages = Array.isArray(o.stages) ? o.stages : [];
  const stages = rawStages.slice(0, 3).map(sanitizeStage);
  if (stages.length === 0) stages.push(sanitizeStage(undefined));
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.slice(0, 60) : d.name,
    stages,
    boosterCount: boosterCountOf(o.boosterCount, d.boosterCount),
    boosterMotor: {
      choice: sanitizeChoice(asObj(o.boosterMotor)?.choice),
      throttle: num(asObj(o.boosterMotor)?.throttle, d.boosterMotor.throttle, 0.1, 1),
    },
    windMps: num(o.windMps, d.windMps, 0, 20),
    windDeg: num(o.windDeg, d.windDeg, 0, 360),
    railM: num(o.railM, d.railM, 0.3, 5),
    railTiltDeg: num(o.railTiltDeg, d.railTiltDeg, 0, 15),
    dt: num(o.dt, d.dt, 0.002, 0.1),
  };
}
