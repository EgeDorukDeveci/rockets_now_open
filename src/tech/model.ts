// Teknik mod veri modeli — OpenRocket bileşen hiyerarşisi.
// Birimler SI; axialOffsetM parent'ın ön ucundan ileri pozitif.

import { TECH_MATERIALS } from "./materials";

export type Finish = "normal" | "smooth" | "rough" | "polished";
export type NoseShape = "conical" | "ogive" | "elliptical" | "parabolic" | "power" | "haack";
export type FinCrossSection = "square" | "rounded" | "airfoil" | "wedge";

export const NOSE_SHAPES: { id: NoseShape; name: string }[] = [
  { id: "conical", name: "Konik" },
  { id: "ogive", name: "Teğet Ogive" },
  { id: "elliptical", name: "Elipsoidal" },
  { id: "parabolic", name: "Parabolik" },
  { id: "power", name: "Power" },
  { id: "haack", name: "Haack" },
];

export const FINISHES: { id: Finish; name: string }[] = [
  { id: "normal", name: "Normal" },
  { id: "smooth", name: "Pürüzsüz" },
  { id: "rough", name: "Pürüzlü" },
  { id: "polished", name: "Cilalı" },
];

export const FIN_CROSS_SECTIONS: { id: FinCrossSection; name: string }[] = [
  { id: "square", name: "Kare" },
  { id: "rounded", name: "Yuvarlatılmış" },
  { id: "airfoil", name: "Kanat Profili" },
  { id: "wedge", name: "Kama" },
];

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface ComponentBase {
  id: string;
  name: string;
  /** Parent ön ucundan eksenel ofset, m (negatif = geri çıkıntı) */
  axialOffsetM: number;
  /** Eksenel bileşenlerde 0; radyal (lug/rail/pod) için merkezden uzaklık, m */
  radialOffsetM: number;
  /** Radyal konum açısı, derece */
  angleDeg: number;
  finish: Finish;
  materialId: string;
  /** OpenRocket mass override, kg */
  massOverrideKg?: number;
}

export interface NoseCone extends ComponentBase {
  kind: "nosecone";
  shape: NoseShape;
  shapeParameter: number;
  lengthM: number;
  aftDiameterM: number;
  wallThicknessM: number;
  filled: boolean;
  shoulderDiameterM: number;
  shoulderLengthM: number;
}

export interface BodyTube extends ComponentBase {
  kind: "bodytube";
  lengthM: number;
  outerDiameterM: number;
  wallThicknessM: number;
  /** İçine montajlanan bileşenler (motormount, centeringring, ...) */
  children: TechComponent[];
}

export interface Transition extends ComponentBase {
  kind: "transition";
  shape: NoseShape;
  shapeParameter: number;
  lengthM: number;
  foreDiameterM: number;
  aftDiameterM: number;
  wallThicknessM: number;
  filled: boolean;
}

export interface TrapezoidFinSet extends ComponentBase {
  kind: "trapezoidfin";
  finCount: number;
  rotationDeg: number;
  rootChordM: number;
  tipChordM: number;
  sweepLengthM: number;
  heightM: number;
  thicknessM: number;
  crossSection: FinCrossSection;
  cantDeg: number;
}

export interface EllipticalFinSet extends ComponentBase {
  kind: "ellipticalfin";
  finCount: number;
  rotationDeg: number;
  rootChordM: number;
  heightM: number;
  thicknessM: number;
  crossSection: FinCrossSection;
  cantDeg: number;
}

export interface FreeformFinSet extends ComponentBase {
  kind: "freeformfin";
  finCount: number;
  rotationDeg: number;
  thicknessM: number;
  /** Çokgen noktaları: x = eksenel (kök LE'den), y = radyal (gövde yüzeyinden), m */
  points: Array<{ x: number; y: number }>;
  cantDeg: number;
}

export interface TubeFinSet extends ComponentBase {
  kind: "tubefin";
  finCount: number;
  rotationDeg: number;
  lengthM: number;
  outerDiameterM: number;
  wallThicknessM: number;
}

export interface Parachute extends ComponentBase {
  kind: "parachute";
  diameterM: number;
  /** null = otomatik (0.8) */
  cdManual: number | null;
  lineCount: number;
  lineLengthM: number;
  deployEvent: "ejection" | "apogee" | "altitude";
  deployAltitudeM: number;
  deployDelayS: number;
}

export interface Streamer extends ComponentBase {
  kind: "streamer";
  stripLengthM: number;
  stripWidthM: number;
}

export interface ShockCord extends ComponentBase {
  kind: "shockcord";
  cordLengthM: number;
}

export interface MassComponent extends ComponentBase {
  kind: "mass";
  massKg: number;
}

export interface LaunchLug extends ComponentBase {
  kind: "launchlug";
  outerDiameterM: number;
  lengthM: number;
}

export interface RailButton extends ComponentBase {
  kind: "railbutton";
  outerDiameterM: number;
  heightM: number;
}

export interface InnerTube extends ComponentBase {
  kind: "innertube";
  lengthM: number;
  outerDiameterM: number;
  wallThicknessM: number;
}

export interface TubeCoupler extends ComponentBase {
  kind: "tubecoupler";
  lengthM: number;
  outerDiameterM: number;
  wallThicknessM: number;
}

export interface CenteringRing extends ComponentBase {
  kind: "centeringring";
  lengthM: number;
  outerDiameterM: number;
  innerDiameterM: number;
}

export interface Bulkhead extends ComponentBase {
  kind: "bulkhead";
  lengthM: number;
  outerDiameterM: number;
}

export interface EngineBlock extends ComponentBase {
  kind: "engineblock";
  lengthM: number;
  outerDiameterM: number;
}

export interface MotorMount extends ComponentBase {
  kind: "motormount";
  /** motor kataloğundaki id (örn. "C6-7"); null = boş */
  motorId: string | null;
  /** Motorun tüp dışına taşan kısmı, m */
  overhangM: number;
}

export type TechComponent =
  | NoseCone
  | BodyTube
  | Transition
  | TrapezoidFinSet
  | EllipticalFinSet
  | FreeformFinSet
  | TubeFinSet
  | Parachute
  | Streamer
  | ShockCord
  | MassComponent
  | LaunchLug
  | RailButton
  | InnerTube
  | TubeCoupler
  | CenteringRing
  | Bulkhead
  | EngineBlock
  | MotorMount;

export type ComponentKind = TechComponent["kind"];

export const TECH_COMPONENT_LABELS: Record<ComponentKind, string> = {
  nosecone: "Burun Konisi",
  bodytube: "Gövde Tüpü",
  transition: "Geçiş Konisi",
  trapezoidfin: "Yamuk Kanat",
  ellipticalfin: "Elips Kanat",
  freeformfin: "Serbest Kanat",
  tubefin: "Tüp Kanat",
  parachute: "Paraşüt",
  streamer: "Şerit",
  shockcord: "Şok İpi",
  mass: "Kütle Bileşeni",
  launchlug: "Rampa Pabucu",
  railbutton: "Ray Butonu",
  innertube: "İç Tüp",
  tubecoupler: "Tüp Kuplörü",
  centeringring: "Santraj Halkası",
  bulkhead: "Bölme",
  engineblock: "Motor Bloğu",
  motormount: "Motor Montajı",
};

export interface TechStage {
  id: string;
  name: string;
  components: TechComponent[];
  separationEvent: "ejection" | "burnout" | "apogee";
  separationDelayS: number;
}

export interface PodSet {
  id: string;
  name: string;
  instanceCount: number;
  radiusOffsetM: number;
  angleOffsetDeg: number;
  axialOffsetM: number;
  components: TechComponent[];
}

export interface ParallelStage {
  id: string;
  name: string;
  instanceCount: number;
  radiusOffsetM: number;
  angleOffsetDeg: number;
  axialOffsetM: number;
  components: TechComponent[];
  separationEvent: "burnout" | "apogee";
}

export interface WindLevel {
  altitudeM: number;
  speedMps: number;
  directionDeg: number;
  stdDev: number;
}

export interface TechConditions {
  launchRodLengthM: number;
  launchRodAngleDeg: number;
  launchRodDirectionDeg: number;
  launchIntoWind: boolean;
  launchAltitudeM: number;
  windModel: "average" | "multilevel";
  windSpeedMps: number;
  windDirectionDeg: number;
  windStdDev: number;
  windLevels: WindLevel[];
  timestepS: number;
  maxTimeS: number;
}

export interface TechRocket {
  name: string;
  designer: string;
  designType: string;
  revision: string;
  stages: TechStage[];
  podSets: PodSet[];
  parallelStages: ParallelStage[];
  conditions: TechConditions;
}

const base = (): ComponentBase => ({
  id: uid(),
  name: "Bileşen",
  axialOffsetM: 0,
  radialOffsetM: 0,
  angleDeg: 0,
  finish: "normal",
  materialId: "cardboard",
});

export function makeComponent(kind: ComponentKind): TechComponent {
  switch (kind) {
    case "nosecone":
      return { ...base(), kind, name: "Burun Konisi", shape: "ogive", shapeParameter: 0.5, lengthM: 0.07, aftDiameterM: 0.0249, wallThicknessM: 0.002, filled: false, shoulderDiameterM: 0.0238, shoulderLengthM: 0.03 };
    case "bodytube":
      return { ...base(), kind, name: "Gövde Tüpü", lengthM: 0.2, outerDiameterM: 0.0249, wallThicknessM: 0.001, children: [] };
    case "transition":
      return { ...base(), kind, name: "Geçiş Konisi", shape: "conical", shapeParameter: 0.5, lengthM: 0.05, foreDiameterM: 0.0249, aftDiameterM: 0.033, wallThicknessM: 0.002, filled: false };
    case "trapezoidfin":
      return { ...base(), kind, name: "Yamuk Kanatlar", finCount: 3, rotationDeg: 0, rootChordM: 0.08, tipChordM: 0.06, sweepLengthM: 0.02, heightM: 0.05, thicknessM: 0.003, crossSection: "airfoil", cantDeg: 0, materialId: "balsa" };
    case "ellipticalfin":
      return { ...base(), kind, name: "Elips Kanatlar", finCount: 3, rotationDeg: 0, rootChordM: 0.08, heightM: 0.05, thicknessM: 0.003, crossSection: "airfoil", cantDeg: 0, materialId: "balsa" };
    case "freeformfin":
      return { ...base(), kind, name: "Serbest Kanatlar", finCount: 3, rotationDeg: 0, thicknessM: 0.003, points: [{ x: 0, y: 0 }, { x: 0.04, y: 0.05 }, { x: 0.08, y: 0.04 }, { x: 0.06, y: 0 }], cantDeg: 0, materialId: "balsa" };
    case "tubefin":
      return { ...base(), kind, name: "Tüp Kanatlar", finCount: 6, rotationDeg: 0, lengthM: 0.08, outerDiameterM: 0.006, wallThicknessM: 0.001 };
    case "parachute":
      return { ...base(), kind, name: "Paraşüt", diameterM: 0.3, cdManual: null, lineCount: 6, lineLengthM: 0.3, deployEvent: "apogee", deployAltitudeM: 150, deployDelayS: 0, materialId: "ripstop" };
    case "streamer":
      return { ...base(), kind, name: "Şerit", stripLengthM: 0.5, stripWidthM: 0.05, materialId: "ripstop" };
    case "shockcord":
      return { ...base(), kind, name: "Şok İpi", cordLengthM: 0.6, materialId: "elastic" };
    case "mass":
      return { ...base(), kind, name: "Kütle Bileşeni", massKg: 0.02 };
    case "launchlug":
      return { ...base(), kind, name: "Rampa Pabucu", outerDiameterM: 0.006, lengthM: 0.035, radialOffsetM: 0.012, materialId: "plywood" };
    case "railbutton":
      return { ...base(), kind, name: "Ray Butonu", outerDiameterM: 0.0097, heightM: 0.0097, radialOffsetM: 0.012, materialId: "phenolic" };
    case "innertube":
      return { ...base(), kind, name: "İç Tüp", lengthM: 0.08, outerDiameterM: 0.019, wallThicknessM: 0.0008, materialId: "phenolic" };
    case "tubecoupler":
      return { ...base(), kind, name: "Tüp Kuplörü", lengthM: 0.05, outerDiameterM: 0.0238, wallThicknessM: 0.0008, materialId: "phenolic" };
    case "centeringring":
      return { ...base(), kind, name: "Santraj Halkası", lengthM: 0.006, outerDiameterM: 0.024, innerDiameterM: 0.019, materialId: "phenolic" };
    case "bulkhead":
      return { ...base(), kind, name: "Bölme", lengthM: 0.002, outerDiameterM: 0.024, materialId: "plywood" };
    case "engineblock":
      return { ...base(), kind, name: "Motor Bloğu", lengthM: 0.006, outerDiameterM: 0.018, materialId: "plywood" };
    case "motormount":
      return { ...base(), kind, name: "Motor Montajı", motorId: "C6-7", overhangM: 0.005, materialId: "phenolic" };
  }
}

export function defaultTechConditions(): TechConditions {
  return {
    launchRodLengthM: 1.2,
    launchRodAngleDeg: 0,
    launchRodDirectionDeg: 0,
    launchIntoWind: true,
    launchAltitudeM: 0,
    windModel: "average",
    windSpeedMps: 3,
    windDirectionDeg: 0,
    windStdDev: 0.2,
    windLevels: [
      { altitudeM: 0, speedMps: 2, directionDeg: 0, stdDev: 0.2 },
      { altitudeM: 100, speedMps: 3, directionDeg: 5, stdDev: 0.3 },
      { altitudeM: 500, speedMps: 5, directionDeg: 10, stdDev: 0.4 },
    ],
    timestepS: 0.01,
    maxTimeS: 600,
  };
}

/** Alpha replikası: BT-50 gövde, ogive burun, 3 kanat, C6-7, 30 cm paraşüt. */
export function defaultTechRocket(): TechRocket {
  const nose = makeComponent("nosecone") as NoseCone;
  nose.name = "Burun Konisi";
  nose.shape = "ogive";
  nose.lengthM = 0.075;
  nose.aftDiameterM = 0.0249;
  nose.wallThicknessM = 0.002;
  nose.materialId = "basswood";
  nose.filled = false;

  const tube = makeComponent("bodytube") as BodyTube;
  tube.name = "Gövde Tüpü";
  tube.lengthM = 0.16;
  tube.outerDiameterM = 0.0249;
  tube.wallThicknessM = 0.001;
  tube.materialId = "cardboard";

  const fin = makeComponent("trapezoidfin") as TrapezoidFinSet;
  fin.name = "Kanatlar";
  fin.finCount = 3;
  fin.rootChordM = 0.07;
  fin.tipChordM = 0.055;
  fin.sweepLengthM = 0.012;
  fin.heightM = 0.045;
  fin.thicknessM = 0.003;
  fin.materialId = "balsa";
  fin.crossSection = "airfoil";

  const lug = makeComponent("launchlug") as LaunchLug;
  lug.name = "Rampa Pabucu";
  lug.axialOffsetM = 0.04;
  lug.radialOffsetM = 0.0125;
  lug.lengthM = 0.03;
  lug.outerDiameterM = 0.006;

  const mount = makeComponent("motormount") as MotorMount;
  mount.name = "Motor Montajı";
  mount.axialOffsetM = 0.09;
  mount.motorId = "C6-7";
  mount.overhangM = 0.005;

  const chute = makeComponent("parachute") as Parachute;
  chute.name = "Paraşüt";
  chute.diameterM = 0.3;
  chute.deployEvent = "apogee";

  const cord = makeComponent("shockcord") as ShockCord;
  cord.name = "Şok İpi";
  cord.cordLengthM = 0.6;

  return {
    name: "Alpha Replica",
    designer: "SlopRocket",
    designType: "kit",
    revision: "1",
    stages: [{
      id: uid(),
      name: "Alpha",
      components: [nose, tube, fin, lug, mount, chute, cord],
      separationEvent: "ejection",
      separationDelayS: 0,
    }],
    podSets: [],
    parallelStages: [],
    conditions: defaultTechConditions(),
  };
}

export function serializeTech(r: TechRocket): string {
  return JSON.stringify(r, null, 2);
}

export function deserializeTech(json: string): TechRocket {
  const parsed = JSON.parse(json) as TechRocket;
  if (!parsed || !Array.isArray(parsed.stages) || parsed.stages.length === 0) {
    throw new Error("Geçersiz teknik tasarım");
  }
  return parsed;
}

export { TECH_MATERIALS };