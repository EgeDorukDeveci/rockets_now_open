// Uçuş öncesi tahmin: tasarım değiştiğinde hızlı bir simülasyon koşarak
// apogee / max hız / Mach / iniş hızı / sürüklenme tahminini üretir (doküman §6).

import { assembleRocket, landingMassKg, landingSpeed } from "./rocket";
import { simulateFlight } from "./trajectory";
import { RocketConfig } from "../types";

export interface FlightPrediction {
  apogeeM: number;
  maxVelMps: number;
  maxMach: number;
  maxG: number;
  maxQ: number;
  flightTimeS: number;
  driftM: number;
  landingMps: number;
  success: boolean;
  message: string;
  stageSepTimeS: number;
  boosterSepTimeS: number;
}

export function predictFlight(config: RocketConfig): FlightPrediction {
  const assembly = assembleRocket(config);
  const result = simulateFlight({ assembly, throttle: 1, prediction: true });

  const rec = config.stages[0].recovery;
  const predictedLanding = rec.type === "parachute" && rec.diameterM > 0
    ? landingSpeed(landingMassKg(assembly), rec.diameterM)
    : result.landingVelMps;

  const sep = result.events.find((e) => e.id === "stageSep");
  const bsep = result.events.find((e) => e.id === "boosterSep");

  return {
    apogeeM: result.maxAltM,
    maxVelMps: result.maxVelMps,
    maxMach: result.maxMach,
    maxG: result.maxG,
    maxQ: result.maxQ,
    flightTimeS: result.flightTimeS,
    driftM: result.driftM,
    landingMps: predictedLanding,
    success: result.success,
    message: result.message,
    stageSepTimeS: sep ? sep.t : -1,
    boosterSepTimeS: bsep ? bsep.t : -1,
  };
}
