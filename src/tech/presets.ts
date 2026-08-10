// Teknik mod hazır tasarımları — bileşen ağacına doğrudan kurulan modeller.
// Casual preset'lerin teknik karşılıkları; motor id'leri teknik katalogdan
// (Estes + APCP "W" şeması) seçilir, simülatör ilk bulduğu motormount'u kullanır
// (çok kademelide alt kademe motoru).

import {
  BodyTube,
  CenteringRing,
  EllipticalFinSet,
  FinCrossSection,
  InnerTube,
  LaunchLug,
  MotorMount,
  NoseCone,
  NoseShape,
  Parachute,
  ShockCord,
  Streamer,
  TechComponent,
  TechConditions,
  TechRocket,
  TechStage,
  TrapezoidFinSet,
  defaultTechConditions,
  makeComponent,
  uid,
} from "./model";
import { motorSpecsFromCatalog } from "./physics/assembly";

export interface TechPreset {
  id: string;
  name: string;
  desc: string;
  build: () => TechRocket;
}

function motorLen(id: string): number {
  return motorSpecsFromCatalog(id)?.length ?? 0.07;
}

function techConditions(rod = 1.2, wind = 2): TechConditions {
  return { ...defaultTechConditions(), launchRodLengthM: rod, windSpeedMps: wind, timestepS: 0.01 };
}

interface FinParams {
  kind?: "trapezoid" | "elliptical";
  count: number;
  rootChord: number;
  tipChord?: number;
  sweep?: number;
  height: number;
  thickness: number;
  material?: string;
  crossSection?: FinCrossSection;
  /** Gövde arka ucuna göre kök ofseti (negatif = gövde içine). */
  xPos?: number;
}

interface StageParams {
  name: string;
  bodyLen: number;
  dia: number;
  wall?: number;
  bodyMat?: string;
  /** Burun uzunluğu (m); varsayılan 2 kalibre. */
  noseLen?: number;
  noseShape?: NoseShape;
  noseMat?: string;
  /** Motor katalog id'si; "" = motorsuz. */
  motor: string;
  overhang?: number;
  recovery?: "parachute" | "streamer";
  chuteDia?: number;
  deployEvent?: Parachute["deployEvent"];
  streamerLen?: number;
  streamerW?: number;
  cord?: number;
  payloadKg?: number;
  fins?: FinParams | null;
  lug?: boolean;
  separation?: TechStage["separationEvent"];
}

function buildStage(p: StageParams): TechStage {
  const nose = makeComponent("nosecone") as NoseCone;
  nose.name = "Burun Konisi";
  nose.shape = p.noseShape ?? "ogive";
  nose.shapeParameter = 0.5;
  nose.lengthM = p.noseLen ?? p.dia * 2;
  nose.aftDiameterM = p.dia;
  nose.wallThicknessM = 0.002;
  nose.materialId = p.noseMat ?? p.bodyMat ?? "cardboard";
  nose.shoulderDiameterM = Math.max(p.dia * 0.94, p.dia - 0.002);
  nose.shoulderLengthM = 0.03;

  const tube = makeComponent("bodytube") as BodyTube;
  tube.name = "Gövde Tüpü";
  tube.lengthM = p.bodyLen;
  tube.outerDiameterM = p.dia;
  tube.wallThicknessM = p.wall ?? 0.001;
  tube.materialId = p.bodyMat ?? "cardboard";

  const children: TechComponent[] = [];
  let mountOffset = 0;
  if (p.motor) {
    const mlen = motorLen(p.motor);
    mountOffset = Math.max(0.01, p.bodyLen - mlen - 0.005);

    const mount = makeComponent("motormount") as MotorMount;
    mount.name = "Motor Montajı";
    mount.motorId = p.motor;
    mount.overhangM = p.overhang ?? 0.005;
    mount.axialOffsetM = mountOffset;
    children.push(mount);

    const inner = makeComponent("innertube") as InnerTube;
    inner.name = "Motor Borusu";
    inner.lengthM = mlen + 0.005;
    inner.outerDiameterM = Math.max(0.013, p.dia * 0.72);
    inner.wallThicknessM = 0.0008;
    inner.axialOffsetM = mountOffset;
    inner.materialId = "phenolic";
    children.push(inner);

    const ring = makeComponent("centeringring") as CenteringRing;
    ring.name = "Santraj Halkası";
    ring.lengthM = 0.006;
    ring.outerDiameterM = p.dia * 0.95;
    ring.innerDiameterM = inner.outerDiameterM;
    ring.axialOffsetM = mountOffset;
    ring.materialId = "phenolic";
    children.push(ring);
  }

  // Kurtarma sistemi + şok ipi burun bölmesinde istiflenir (CG'yi öne çeker).
  const cord = makeComponent("shockcord") as ShockCord;
  cord.name = "Şok İpi";
  cord.cordLengthM = p.cord ?? 0.6;
  cord.axialOffsetM = 0.01;
  cord.materialId = p.bodyMat === "fiberglass" ? "kevlar" : "elastic";
  children.push(cord);

  if (p.recovery === "parachute") {
    const ch = makeComponent("parachute") as Parachute;
    ch.name = "Paraşüt";
    ch.diameterM = p.chuteDia ?? 0.3;
    ch.deployEvent = p.deployEvent ?? "ejection";
    ch.deployDelayS = 0;
    ch.lineLengthM = Math.min(0.6, (p.chuteDia ?? 0.3) * 1.2);
    ch.axialOffsetM = 0.02;
    ch.materialId = "ripstop";
    children.push(ch);
  } else if (p.recovery === "streamer") {
    const st = makeComponent("streamer") as Streamer;
    st.name = "Şerit";
    st.stripLengthM = p.streamerLen ?? 0.5;
    st.stripWidthM = p.streamerW ?? 0.05;
    st.axialOffsetM = 0.02;
    st.materialId = "ripstop";
    children.push(st);
  }

  if (p.payloadKg) {
    const m = makeComponent("mass") as Extract<TechComponent, { kind: "mass" }>;
    m.name = "Yük";
    m.massKg = p.payloadKg;
    m.axialOffsetM = 0.02;
    children.push(m);
  }

  tube.children = children;

  const comps: TechComponent[] = [nose, tube];

  if (p.fins) {
    const f = p.fins.kind === "elliptical"
      ? (makeComponent("ellipticalfin") as EllipticalFinSet)
      : (makeComponent("trapezoidfin") as TrapezoidFinSet);
    f.name = p.fins.kind === "elliptical" ? "Elips Kanatlar" : "Kanatlar";
    f.finCount = p.fins.count;
    f.rootChordM = p.fins.rootChord;
    f.heightM = p.fins.height;
    f.thicknessM = p.fins.thickness;
    f.materialId = p.fins.material ?? "balsa";
    f.crossSection = p.fins.crossSection ?? "airfoil";
    if (f.kind === "trapezoidfin") {
      f.tipChordM = p.fins.tipChord ?? p.fins.rootChord * 0.8;
      f.sweepLengthM = p.fins.sweep ?? 0.02;
    }
    f.axialOffsetM = p.fins.xPos ?? -(p.fins.rootChord) - 0.03;
    comps.push(f);
  }

  if (p.lug) {
    const lug = makeComponent("launchlug") as LaunchLug;
    lug.name = "Rampa Pabucu";
    lug.axialOffsetM = 0.04;
    lug.radialOffsetM = p.dia / 2 + 0.001;
    lug.lengthM = 0.03;
    lug.outerDiameterM = 0.006;
    comps.push(lug);
  }

  return {
    id: uid(),
    name: p.name,
    components: comps,
    separationEvent: p.separation ?? "ejection",
    separationDelayS: 0,
  };
}

function rocket(name: string, stages: TechStage[], rod = 1.2, wind = 2): TechRocket {
  return {
    name,
    designer: "SlopRocket",
    designType: "tech",
    revision: "1",
    stages,
    podSets: [],
    parallelStages: [],
    conditions: techConditions(rod, wind),
  };
}

export const TECH_PRESETS: TechPreset[] = [
  {
    id: "alpha",
    name: "Estes Alpha",
    desc: "Klasik başlangıç — BT-50, C6-7, 30 cm paraşüt",
    build: () => rocket("Estes Alpha", [
      buildStage({
        name: "Alpha",
        bodyLen: 0.262, dia: 0.0249, bodyMat: "cardboard",
        noseLen: 0.05, noseShape: "ogive",
        motor: "C6-7",
        fins: { count: 3, rootChord: 0.08, tipChord: 0.06, sweep: 0.02, height: 0.045, thickness: 0.003, material: "balsa" },
        recovery: "parachute", chuteDia: 0.3, deployEvent: "ejection",
        lug: true,
      }),
    ], 1.2, 2),
  },
  {
    id: "bigBertha",
    name: "Estes Big Bertha",
    desc: "BT-80 kalın gövde — D12-5, 50 cm paraşüt",
    build: () => rocket("Estes Big Bertha", [
      buildStage({
        name: "Big Bertha",
        bodyLen: 0.5, dia: 0.066, bodyMat: "cardboard",
        noseLen: 0.165, noseShape: "ogive",
        motor: "D12-5",
        fins: { count: 4, rootChord: 0.1, tipChord: 0.07, sweep: 0.02, height: 0.07, thickness: 0.003, material: "balsa" },
        recovery: "parachute", chuteDia: 0.5, deployEvent: "ejection",
        lug: true,
      }),
    ], 1.8, 3),
  },
  {
    id: "derRedMax",
    name: "Estes Der Red Max",
    desc: "Süpürmeli kanatlar — D12-5, 40 cm paraşüt",
    build: () => rocket("Estes Der Red Max", [
      buildStage({
        name: "Der Red Max",
        bodyLen: 0.32, dia: 0.033, bodyMat: "cardboard",
        noseLen: 0.092, noseShape: "ogive",
        motor: "D12-5",
        fins: { count: 4, rootChord: 0.085, tipChord: 0.05, sweep: 0.035, height: 0.06, thickness: 0.003, material: "balsa" },
        recovery: "parachute", chuteDia: 0.4, deployEvent: "ejection",
        lug: true,
      }),
    ], 1.2, 2),
  },
  {
    id: "wizard",
    name: "Estes Wizard",
    desc: "Hafif başlangıç — şerit kurtarma, C6-7",
    build: () => rocket("Estes Wizard", [
      buildStage({
        name: "Wizard",
        bodyLen: 0.28, dia: 0.0249, bodyMat: "cardboard",
        noseLen: 0.05, noseShape: "ogive",
        motor: "C6-7",
        fins: { count: 3, rootChord: 0.07, tipChord: 0.05, sweep: 0.015, height: 0.045, thickness: 0.003, material: "balsa" },
        recovery: "streamer", streamerLen: 0.5, streamerW: 0.05,
        lug: true,
      }),
    ], 1.2, 2),
  },
  {
    id: "bigDaddy",
    name: "Estes Big Daddy",
    desc: "BT-80 + elips kanatlar — E12-6, 60 cm paraşüt",
    build: () => rocket("Estes Big Daddy", [
      buildStage({
        name: "Big Daddy",
        bodyLen: 0.56, dia: 0.066, bodyMat: "cardboard",
        noseLen: 0.198, noseShape: "ogive",
        motor: "E12-6",
        fins: { kind: "elliptical", count: 4, rootChord: 0.12, height: 0.09, thickness: 0.003, material: "balsa" },
        recovery: "parachute", chuteDia: 0.6, deployEvent: "ejection",
        lug: true,
      }),
    ], 1.8, 3),
  },
  {
    id: "highPowerG",
    name: "Yüksek Güç G (APCP)",
    desc: "Fiberglas gövde — APCP G30-7W, apoge tetikli açılış",
    build: () => rocket("Yüksek Güç G (APCP)", [
      buildStage({
        name: "G-Kademe",
        bodyLen: 1.1, dia: 0.075, wall: 0.002, bodyMat: "fiberglass",
        noseLen: 0.24, noseShape: "ogive",
        motor: "G30-7W",
        fins: { count: 4, rootChord: 0.16, tipChord: 0.08, sweep: 0.03, height: 0.13, thickness: 0.004, material: "fiberglass" },
        recovery: "parachute", chuteDia: 2.2, deployEvent: "apogee",
        cord: 1.2, payloadKg: 0.05,
      }),
    ], 2.4, 3),
  },
  {
    id: "saturnV",
    name: "Saturn V (1:100)",
    desc: "Üç kademe APCP — S-IC + S-II + S-IVB, 60 cm paraşüt",
    build: () => {
      const s1 = buildStage({
        name: "S-IC",
        bodyLen: 0.45, dia: 0.1, wall: 0.002, bodyMat: "aluminum",
        noseLen: 0.04, noseShape: "conical",
        motor: "G30-7W",
        fins: { count: 4, rootChord: 0.14, tipChord: 0.08, sweep: 0.03, height: 0.09, thickness: 0.004, material: "aluminum", xPos: -0.17 },
        separation: "burnout",
      });
      const s2 = buildStage({
        name: "S-II",
        bodyLen: 0.3, dia: 0.08, wall: 0.001, bodyMat: "cardboard",
        noseLen: 0.08, noseShape: "conical",
        motor: "F24-6W",
        separation: "burnout",
      });
      const s3 = buildStage({
        name: "S-IVB",
        bodyLen: 0.22, dia: 0.065, wall: 0.001, bodyMat: "cardboard",
        noseLen: 0.208, noseShape: "ogive",
        motor: "E20-5W",
        recovery: "parachute", chuteDia: 0.6, deployEvent: "apogee",
        cord: 1,
      });
      return rocket("Saturn V (1:100)", [s1, s2, s3], 2, 2);
    },
  },
  {
    id: "falcon9",
    name: "Falcon 9 (Model)",
    desc: "İki kademe — APCP güçlendirici + üst kademe, 1.5 m paraşüt",
    build: () => {
      const s1 = buildStage({
        name: "Booster",
        bodyLen: 0.8, dia: 0.08, wall: 0.002, bodyMat: "aluminum",
        noseLen: 0.048, noseShape: "conical",
        motor: "G30-7W",
        fins: { count: 4, rootChord: 0.16, tipChord: 0.06, sweep: 0.04, height: 0.12, thickness: 0.004, material: "aluminum", xPos: -0.19 },
        separation: "burnout",
      });
      const s2 = buildStage({
        name: "Uzay Aracı",
        bodyLen: 0.6, dia: 0.05, wall: 0.001, bodyMat: "cardboard",
        noseLen: 0.15, noseShape: "ogive",
        motor: "E20-5W",
        recovery: "parachute", chuteDia: 1.5, deployEvent: "apogee",
        cord: 1,
      });
      return rocket("Falcon 9 (Model)", [s1, s2], 2, 2);
    },
  },
];
