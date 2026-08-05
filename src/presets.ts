// Hazır roket tasarımları (doküman §7).
// Boyutlar doğrulanmış gerçek değerlere yakın; Saturn V / Falcon 9 ölçekli modellerdir.

import { RocketConfig, defaultStage, MotorChoice } from "./types";
import { GrainGeometry } from "./physics/motors/curve";

export interface Preset {
  id: string;
  name: string;
  desc: string;
  build: () => RocketConfig;
}

function estesStage(params: {
  bodyLen: number; dia: number; noseCal: number; fins: number; finRoot: number;
  finTip: number; finSpan: number; motor: string; chute: number;
}): ReturnType<typeof defaultStage> {
  const s = defaultStage();
  s.body.lengthM = params.bodyLen;
  s.body.diameterM = params.dia;
  s.body.material = "kraft";
  s.body.paint = true;
  s.nose.profile = "tangentOgive";
  s.nose.lengthCalibers = params.noseCal;
  s.nose.material = "kraft";
  s.fins.count = params.fins as 0 | 3 | 4 | 5 | 6;
  s.fins.rootChordM = params.finRoot;
  s.fins.tipChordM = params.finTip;
  s.fins.semispanM = params.finSpan;
  s.fins.xPosM = Math.max(0, params.bodyLen - params.finRoot - 0.03);
  s.fins.material = "balsa";
  s.motor.choice = { kind: "estes", id: params.motor, count: 1 };
  s.recovery = { type: "parachute", diameterM: params.chute, material: "plastic", trigger: "delay", timerSeconds: 2, shockCordM: 0.8, drogueDiaM: 0 };
  return s;
}

function stageWithMotor(
  over: { bodyLen?: number; dia?: number; noseCal?: number; fins?: number; finRoot?: number; finTip?: number; finSpan?: number; xPos?: number; material?: string; paint?: boolean },
  motor: MotorChoice,
  chuteDia = 0.4,
  separation: "hot" | "cold" = "hot"
): ReturnType<typeof defaultStage> {
  const s = defaultStage();
  s.body.lengthM = over.bodyLen ?? 0.4;
  s.body.diameterM = over.dia ?? 0.025;
  s.body.material = over.material ?? "kraft";
  s.body.paint = over.paint ?? true;
  s.nose.lengthCalibers = over.noseCal ?? 2;
  s.nose.material = over.material ?? "kraft";
  s.fins.count = (over.fins ?? 3) as 0 | 3 | 4 | 5 | 6;
  s.fins.rootChordM = over.finRoot ?? 0.08;
  s.fins.tipChordM = over.finTip ?? 0.06;
  s.fins.semispanM = over.finSpan ?? 0.05;
  s.fins.xPosM = over.xPos ?? Math.max(0, s.body.lengthM - (over.finRoot ?? 0.08) - 0.03);
  s.motor.choice = motor;
  s.recovery = { type: "parachute", diameterM: chuteDia, material: "plastic", trigger: "delay", timerSeconds: 2, shockCordM: 0.8, drogueDiaM: 0 };
  s.separation = separation;
  return s;
}

export const PRESETS: Preset[] = [
  {
    id: "alpha",
    name: "Estes Alpha",
    desc: "Klasik başlangıç roketi — 31 cm, C6-7 ile ~200 m",
    build: () => {
      const s = estesStage({
        bodyLen: 0.262, dia: 0.0249, noseCal: 2, fins: 3,
        finRoot: 0.08, finTip: 0.06, finSpan: 0.045, motor: "C6-7", chute: 0.3,
      });
      return {
        name: "Estes Alpha", stages: [s], boosterCount: 0,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
        windMps: 2, windDeg: 0, railM: 1.2, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "bigBertha",
    name: "Estes Big Bertha",
    desc: "Kalın gövdeli (6.6 cm) yüksek itki — D12-5 ile ~130 m",
    build: () => {
      const s = estesStage({
        bodyLen: 0.5, dia: 0.066, noseCal: 2.5, fins: 4,
        finRoot: 0.1, finTip: 0.07, finSpan: 0.07, motor: "D12-5", chute: 0.5,
      });
      return {
        name: "Estes Big Bertha", stages: [s], boosterCount: 0,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
        windMps: 3, windDeg: 0, railM: 1.8, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "derRedMax",
    name: "Estes Der Red Max",
    desc: "Kızıl sport roket — 4 taramalı kanat, D12-5 ile ~240 m",
    build: () => {
      const s = estesStage({
        bodyLen: 0.32, dia: 0.033, noseCal: 2.8, fins: 4,
        finRoot: 0.085, finTip: 0.05, finSpan: 0.06, motor: "D12-5", chute: 0.4,
      });
      s.fins.geometry = "swept";
      s.fins.sweepDeg = 18;
      return {
        name: "Estes Der Red Max", stages: [s], boosterCount: 0,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
        windMps: 2, windDeg: 0, railM: 1.2, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "wizard",
    name: "Estes Wizard",
    desc: "Hafif başlangıç roketi — şerit (streamer) kurtarma, C6-7 ile ~220 m",
    build: () => {
      const s = estesStage({
        bodyLen: 0.28, dia: 0.0249, noseCal: 2, fins: 3,
        finRoot: 0.07, finTip: 0.05, finSpan: 0.045, motor: "C6-7", chute: 0,
      });
      s.recovery = {
        type: "streamer", diameterM: 0.09, material: "ripstop",
        trigger: "delay", timerSeconds: 2, shockCordM: 0.5, drogueDiaM: 0,
      };
      return {
        name: "Estes Wizard", stages: [s], boosterCount: 0,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
        windMps: 2, windDeg: 0, railM: 1.2, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "boostedBertha",
    name: "Boosted Bertha",
    desc: "İki paralel güçlendiricili — D12-5 çekirdek + 2× C6-7 strapon",
    build: () => {
      const s = estesStage({
        bodyLen: 0.5, dia: 0.066, noseCal: 2.5, fins: 4,
        finRoot: 0.1, finTip: 0.07, finSpan: 0.07, motor: "D12-5", chute: 0.55,
      });
      return {
        name: "Boosted Bertha", stages: [s], boosterCount: 2,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 1 }, throttle: 1 },
        windMps: 2, windDeg: 0, railM: 1.8, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "highPowerH",
    name: "Yüksek Güç H (APCP)",
    desc: "Fiberglas gövde — H-sınıfı APCP, çift paraşüt (drogue + ana)",
    build: () => {
      const g = { kind: "apcp" as const, cls: "H" as const, avgThrustN: 150, delay: 0, impulsePct: 0.6, grain: "bates" as GrainGeometry, count: 1 };
      const s = stageWithMotor(
        { bodyLen: 1.1, dia: 0.075, noseCal: 3.2, fins: 4, finRoot: 0.16, finTip: 0.08, finSpan: 0.13, material: "fiberglass", paint: true },
        g, 2.2, "hot"
      );
      s.recovery.trigger = "apogee";
      s.recovery.diameterM = 2.2;
      s.recovery.drogueDiaM = 0.5;
      s.payload.avionics = "altimeter";
      return {
        name: "Yüksek Güç H (APCP)", stages: [s], boosterCount: 0,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
        windMps: 3, windDeg: 0, railM: 2.4, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "hybridN2O",
    name: "Hibrit N2O/Parafin",
    desc: "Kısılabilir hibrit motor — uçuş bilgisayarı, apogee tetikli açılış",
    build: () => {
      const s = stageWithMotor(
        { bodyLen: 0.9, dia: 0.075, noseCal: 2.5, fins: 3, finRoot: 0.13, finTip: 0.07, finSpan: 0.11, material: "phenolic", paint: true },
        { kind: "hybrid", thrustN: 90, propMassKg: 0.045, count: 1 }, 1.8, "hot"
      );
      s.recovery.trigger = "apogee";
      s.recovery.diameterM = 1.8;
      s.payload.avionics = "flightComputer";
      return {
        name: "Hibrit N2O/Parafin", stages: [s], boosterCount: 0,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
        windMps: 2, windDeg: 0, railM: 2, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "bigDaddy",
    name: "Estes Big Daddy",
    desc: "Geniş BT-80 gövde — 4 büyük kanat, E12-6 ile ~200 m",
    build: () => {
      const s = estesStage({
        bodyLen: 0.56, dia: 0.066, noseCal: 3, fins: 4,
        finRoot: 0.12, finTip: 0.08, finSpan: 0.09, motor: "E12-6", chute: 0.6,
      });
      s.fins.geometry = "elliptical";
      return {
        name: "Estes Big Daddy", stages: [s], boosterCount: 0,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
        windMps: 3, windDeg: 0, railM: 1.8, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "saturnV",
    name: "Saturn V (1:100)",
    desc: "Üç kademeli G-sınıfı APCP — ~1.1 m, 4 kanat",
    build: () => {
      const g = { kind: "apcp" as const, cls: "G" as const, avgThrustN: 55, delay: 6, impulsePct: 0.9, grain: "bates" as GrainGeometry, count: 1 };
      const s3 = stageWithMotor({ bodyLen: 0.22, dia: 0.065, noseCal: 3.2, fins: 0, material: "aluminum", paint: false }, g, 0.6);
      const s2 = stageWithMotor({ bodyLen: 0.3, dia: 0.08, noseCal: 1, fins: 0, material: "aluminum", paint: false }, g, 0.6, "cold");
      const s1 = stageWithMotor({ bodyLen: 0.45, dia: 0.1, noseCal: 0.4, fins: 4, finRoot: 0.14, finTip: 0.08, finSpan: 0.09, material: "aluminum", paint: false }, g, 0.6, "cold");
      return {
        name: "Saturn V (1:100)", stages: [s3, s2, s1], boosterCount: 0,
        boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
        windMps: 2, windDeg: 0, railM: 2, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
  {
    id: "falcon9",
    name: "Falcon 9 (Model)",
    desc: "İki kademeli sıvı yakıtlı — Merlin benzeri 220 N",
    build: () => {
      // Model ölçeği: kısa yanmalı küçük sıvı motorlar (gerçek Merlin ölçeğinde
      // değil; model roket sınıfı itkiler), aksi halde roket onlarca km'ye uçar.
      const m1 = { kind: "liquid" as const, fuel: "LOX/RP-1" as const, name: "Merlin-1", thrustN: 85, propMassKg: 0.09, dryFraction: 0.1, count: 1 };
      const m2 = { kind: "liquid" as const, fuel: "LOX/RP-1" as const, name: "Merlin-Vac", thrustN: 14, propMassKg: 0.02, dryFraction: 0.1, count: 1 };
      const s2 = stageWithMotor({ bodyLen: 0.6, dia: 0.05, noseCal: 3, fins: 0, material: "aluminum" }, m2, 0.5, "cold");
      const s1 = stageWithMotor({ bodyLen: 0.8, dia: 0.08, noseCal: 0.6, fins: 4, finRoot: 0.16, finTip: 0.06, finSpan: 0.12, material: "aluminum" }, m1, 0.5, "cold");
      // Sıvı motorda eject charge yok: apogee algılama + uçuş bilgisayarı gerekir,
      // aksi halde kurtarma burn-out'ta >25 m/s'de açılıp roket parçalanır.
      s2.recovery.trigger = "apogee";
      s2.recovery.diameterM = 1.5;
      s2.payload.avionics = "flightComputer";
      return {
        name: "Falcon 9 (Model)", stages: [s2, s1], boosterCount: 0,
        boosterMotor: { choice: { kind: "liquid", fuel: "LOX/RP-1", name: "Merlin-1", thrustN: 150, propMassKg: 3, dryFraction: 0.1, count: 1 }, throttle: 1 },
        windMps: 2, windDeg: 0, railM: 2, railTiltDeg: 0, dt: 0.01,
      };
    },
  },
];
