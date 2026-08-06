// Casual <-> Teknik mod dönüşümü.
// Birincil yön casual -> teknik: "Teknik Mod" anahtarı mevcut tasarımı
// OpenRocket benzeri bileşen ağacına taşır. Teknik -> casual geri dönüş
// en iyi çabayla yapılır (desteklenmeyen şekiller varsayılana düşer).

import {
  BodyTube,
  CenteringRing,
  ComponentKind,
  EllipticalFinSet,
  InnerTube,
  MassComponent,
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
  makeComponent,
  uid,
} from "./model";
import { RocketConfig, StageConfig } from "../types";
import { motorSpecsFromCatalog } from "./physics/assembly";
import { defaultTechConditions } from "./model";

const MAT_MAP: Record<string, string> = {
  kraft: "cardboard",
  phenolic: "phenolic",
  fiberglass: "fiberglass",
  carbon: "carbon",
  aluminum: "aluminum",
  titanium: "aluminum",
  balsa: "balsa",
  plywood: "plywood",
  plastic: "ripstop",
  ripstop: "ripstop",
  nylon: "nylon",
};

function techMaterialId(casualId: string): string {
  return MAT_MAP[casualId] ?? "cardboard";
}

const NOSE_MAP: Record<string, NoseShape> = {
  conical: "conical",
  tangentOgive: "ogive",
  secantOgive: "power",
  parabolic: "parabolic",
  vonKarman: "haack",
  power: "power",
  blunt: "conical",
};

const NOSE_MAP_REV: Record<string, string> = {
  conical: "conical",
  ogive: "tangentOgive",
  power: "power",
  parabolic: "parabolic",
  haack: "vonKarman",
  elliptical: "tangentOgive",
};

const CROSS_MAP: Record<string, "square" | "rounded" | "airfoil" | "wedge"> = {
  flat: "square",
  airfoil: "airfoil",
  wedge: "wedge",
  rounded: "rounded",
};

const CROSS_MAP_REV: Record<string, "flat" | "wedge" | "rounded"> = {
  square: "flat",
  airfoil: "rounded",
  wedge: "wedge",
  rounded: "rounded",
};

function noseLength(s: StageConfig): number {
  return s.nose.lengthCalibers * s.body.diameterM;
}

function motorLength(id: string | null): number {
  if (!id) return 0.07;
  return motorSpecsFromCatalog(id)?.length ?? 0.07;
}

function motorIdFor(choice: StageConfig["motor"]["choice"]): string | null {
  if (choice.kind === "estes") return choice.id;
  if (choice.kind === "apcp") {
    const cls = choice.cls.charAt(0).toUpperCase();
    return `${cls}${Math.round(choice.avgThrustN)}-${choice.delay}W`;
  }
  return null;
}

/** Casual kademeyi teknik kademeye çevirir. */
function stageToTech(s: StageConfig, index: number): TechStage {
  const dia = s.body.diameterM;
  const nose = makeComponent("nosecone") as NoseCone;
  nose.name = "Burun Konisi";
  nose.shape = NOSE_MAP[s.nose.profile] ?? "ogive";
  nose.shapeParameter = NOSE_MAP[nose.shape] === "power" ? s.nose.powerN : 0.5;
  nose.lengthM = noseLength(s);
  nose.aftDiameterM = dia;
  nose.wallThicknessM = 0.002;
  nose.filled = !s.nose.hollow;
  nose.shoulderDiameterM = Math.max(dia * 0.94, dia - 0.002);
  nose.shoulderLengthM = 0.03;
  nose.materialId = techMaterialId(s.nose.material);

  const tube = makeComponent("bodytube") as BodyTube;
  tube.name = "Gövde Tüpü";
  tube.lengthM = s.body.lengthM;
  tube.outerDiameterM = dia;
  tube.wallThicknessM = s.body.wallM;
  tube.materialId = techMaterialId(s.body.material);

  const mountId = motorIdFor(s.motor.choice);
  const mount = makeComponent("motormount") as MotorMount;
  mount.name = "Motor Montajı";
  const mLength = motorLength(mountId);
  mount.motorId = mountId;
  mount.overhangM = 0.005;
  mount.axialOffsetM = Math.max(0.01, tube.lengthM - mLength - 0.005);

  const inner = makeComponent("innertube") as InnerTube;
  inner.name = "Motor Borusu";
  inner.lengthM = mLength + 0.005;
  inner.outerDiameterM = s.body.mountTubeM > 0 ? s.body.mountTubeM : Math.max(0.013, dia * 0.72);
  inner.wallThicknessM = 0.0008;
  inner.axialOffsetM = mount.axialOffsetM;
  inner.materialId = "phenolic";

  const ring = makeComponent("centeringring") as CenteringRing;
  ring.name = "Santraj Halkası";
  ring.lengthM = 0.006;
  ring.outerDiameterM = dia * 0.95;
  ring.innerDiameterM = inner.outerDiameterM;
  ring.axialOffsetM = mount.axialOffsetM;
  ring.materialId = "phenolic";

  const children: TechComponent[] = [mount, inner, ring];

  const cord = makeComponent("shockcord") as ShockCord;
  cord.name = "Şok İpi";
  cord.cordLengthM = s.recovery.shockCordM;
  cord.axialOffsetM = mount.axialOffsetM - 0.015;
  cord.materialId = "elastic";
  children.push(cord);

  if (s.recovery.type === "parachute" || s.recovery.type === "streamer") {
    const rec = s.recovery.type === "parachute"
      ? (makeComponent("parachute") as Parachute)
      : (makeComponent("streamer") as Streamer);
    if (s.recovery.type === "parachute") {
      const ch = rec as Parachute;
      ch.name = "Paraşüt";
      ch.diameterM = s.recovery.diameterM;
      ch.deployEvent =
        s.recovery.trigger === "apogee"
          ? "apogee"
          : s.recovery.trigger === "timer"
            ? "altitude"
            : "ejection";
      ch.deployDelayS = s.recovery.trigger === "timer" ? s.recovery.timerSeconds : 0;
      ch.lineLengthM = Math.min(0.5, ch.diameterM);
    } else {
      const st = rec as Streamer;
      st.name = "Şerit";
      st.stripLengthM = s.recovery.diameterM;
      st.stripWidthM = Math.max(0.04, s.recovery.diameterM / 5);
    }
    rec.axialOffsetM = mount.axialOffsetM - 0.03;
    rec.materialId = techMaterialId(s.recovery.material);
    children.push(rec);
  }

  tube.children = children;

  const components: TechComponent[] = [nose, tube];

  const fins: TechComponent[] = [];
  if (s.fins.count > 0) {
    let fin: TrapezoidFinSet | EllipticalFinSet;
    if (s.fins.geometry === "elliptical" || s.fins.geometry === "rounded") {
      const e = makeComponent("ellipticalfin") as EllipticalFinSet;
      e.name = "Elips Kanatlar";
      e.rootChordM = s.fins.rootChordM;
      e.heightM = s.fins.semispanM;
      e.thicknessM = s.fins.thicknessM;
      e.cantDeg = s.fins.cantDeg;
      fin = e;
    } else {
      const t = makeComponent("trapezoidfin") as TrapezoidFinSet;
      t.name = "Kanatlar";
      t.rootChordM = s.fins.rootChordM;
      t.tipChordM = s.fins.tipChordM;
      t.heightM = s.fins.semispanM;
      t.sweepLengthM = Math.max(0, s.fins.semispanM * Math.tan((s.fins.sweepDeg * Math.PI) / 180));
      t.thicknessM = s.fins.thicknessM;
      t.cantDeg = s.fins.cantDeg;
      fin = t;
    }
    fin.finCount = s.fins.count;
    fin.crossSection = CROSS_MAP[s.fins.airfoil] ?? "square";
    fin.materialId = techMaterialId(s.fins.material);
    const finX = s.fins.xPosM - noseLength(s) - s.body.lengthM;
    fin.axialOffsetM = finX;
    fins.push(fin);
  }

  if (s.payload.hasPayload && s.payload.cargoKg > 0) {
    const mass = makeComponent("mass") as MassComponent;
    mass.name = "Yük";
    mass.massKg = s.payload.cargoKg;
    mass.axialOffsetM = -0.02;
    fins.unshift(mass);
  }

  components.push(...fins);

  return {
    id: uid(),
    name: `Kademe ${index + 1}`,
    components,
    separationEvent: s.separation === "hot" ? "ejection" : "burnout",
    separationDelayS: 0,
  };
}

/** Casual tasarımı teknik bileşen ağacına çevirir. */
export function casualToTech(cfg: RocketConfig): TechRocket {
  const conditions: TechConditions = {
    ...defaultTechConditions(),
    launchRodLengthM: cfg.railM,
    launchRodAngleDeg: cfg.railTiltDeg,
    launchRodDirectionDeg: cfg.windDeg,
    windSpeedMps: cfg.windMps,
    windDirectionDeg: cfg.windDeg,
    timestepS: cfg.dt,
  };

  const parallelStages = (() => {
    if (cfg.boosterCount === 0 || cfg.stages.length === 0) return [];
    const booster = stageToTech(
      { ...cfg.stages[0], nose: { ...cfg.stages[0].nose, lengthCalibers: 1.5 }, fins: { ...cfg.stages[0].fins, count: 0 } },
      0,
    );
    return [{
      id: uid(),
      name: "Güçlendirici",
      instanceCount: cfg.boosterCount,
      radiusOffsetM: Math.max(0.03, cfg.stages[0].body.diameterM),
      angleOffsetDeg: 0,
      axialOffsetM: 0,
      components: booster.components,
      separationEvent: "burnout" as const,
    }];
  })();

  return {
    name: cfg.name,
    designer: "SlopRocket",
    designType: "casual",
    revision: "1",
    stages: cfg.stages.map((s, i) => stageToTech(s, i)),
    podSets: [],
    parallelStages,
    conditions,
  };
}

function findKind(cs: TechComponent[], kind: ComponentKind): TechComponent | null {
  for (const c of cs) {
    if (c.kind === kind) return c;
    if (c.kind === "bodytube") {
      const hit = findKind(c.children, kind);
      if (hit) return hit;
    }
  }
  return null;
}

/** Teknik tasarımı casual yapılandırmaya çevirir (en iyi çaba). */
export function techToCasual(r: TechRocket): RocketConfig {
  const stage = r.stages[0];
  const parts = stage?.components ?? [];

  const noseTech = findKind(parts, "nosecone") as NoseCone | null;
  const tubeTech = findKind(parts, "bodytube") as BodyTube | null;
  const finTech = findKind(parts, "trapezoidfin") as TrapezoidFinSet | null;
  const finEll = findKind(parts, "ellipticalfin") as EllipticalFinSet | null;
  const mountTech = findKind(parts, "motormount") as MotorMount | null;
  const chuteTech = findKind(parts, "parachute") as Parachute | null;
  const streamerTech = findKind(parts, "streamer") as Streamer | null;
  const cordTech = findKind(parts, "shockcord") as ShockCord | null;
  const massTech = findKind(parts, "mass") as MassComponent | null;

  const dia = tubeTech?.outerDiameterM ?? 0.0249;
  const noseLen = noseTech?.lengthM ?? dia * 2;

  const s = {
    body: {
      lengthM: tubeTech?.lengthM ?? 0.262,
      diameterM: dia,
      wallM: tubeTech?.wallThicknessM ?? 0.001,
      material: Object.entries(MAT_MAP).find(([, t]) => t === (tubeTech?.materialId ?? "cardboard"))?.[0] ?? "kraft",
      paint: false,
      mountTubeM: 0.018,
    },
    nose: {
      profile: (NOSE_MAP_REV[noseTech?.shape ?? "ogive"] ?? "tangentOgive") as "tangentOgive",
      lengthCalibers: noseLen / dia,
      material: Object.entries(MAT_MAP).find(([, t]) => t === (noseTech?.materialId ?? "cardboard"))?.[0] ?? "kraft",
      hollow: !(noseTech?.filled ?? false),
      powerN: noseTech?.shapeParameter ?? 0.5,
      bluntness: 0.1,
    },
    fins: {
      count: (finTech?.finCount ?? finEll?.finCount ?? 0) as 0 | 3 | 4 | 5 | 6,
      geometry: (finTech
        ? finTech.tipChordM >= finTech.rootChordM * 0.97
          ? "rectangular"
          : finTech.tipChordM < finTech.rootChordM * 0.05
            ? "delta"
            : "clippedDelta"
        : finEll
          ? "elliptical"
          : "rectangular") as "rectangular",
      rootChordM: finTech?.rootChordM ?? finEll?.rootChordM ?? 0.08,
      tipChordM: finTech?.tipChordM ?? 0.06,
      semispanM: finTech?.heightM ?? finEll?.heightM ?? 0.045,
      sweepDeg: finTech
        ? (Math.atan2(finTech.sweepLengthM, Math.max(0.001, finTech.heightM)) * 180) / Math.PI
        : 0,
      xPosM: noseLen + (tubeTech?.lengthM ?? 0.262) + Math.max(0, finTech?.axialOffsetM ?? 0),
      cantDeg: finTech?.cantDeg ?? 0,
      airfoil: CROSS_MAP_REV[finTech?.crossSection ?? "square"] ?? "flat",
      material: "balsa",
      thicknessM: finTech?.thicknessM ?? 0.003,
    },
    motor: {
      choice: (mountTech?.motorId
        ? mountTech.motorId.endsWith("W")
          ? { kind: "apcp", cls: mountTech.motorId.charAt(0) as "A" | "B" | "C" | "D" | "E" | "F" | "G", avgThrustN: Number(mountTech.motorId.match(/\d+/)![0]), delay: Number(mountTech.motorId.match(/-(\d+)W/)?.[1] ?? 0), impulsePct: 100, grain: "bates" as const, count: 1 }
          : { kind: "estes", id: mountTech.motorId, count: 1 }
        : { kind: "estes", id: "C6-7", count: 1 }) as StageConfig["motor"]["choice"],
      throttle: 1,
    },
    recovery: streamerTech
      ? {
          type: "streamer" as const,
          diameterM: streamerTech.stripLengthM,
          material: "ripstop",
          trigger: "delay" as const,
          timerSeconds: 2,
          shockCordM: cordTech?.cordLengthM ?? 0.6,
          drogueDiaM: 0,
        }
      : {
          type: chuteTech ? ("parachute" as const) : ("none" as const),
          diameterM: chuteTech?.diameterM ?? 0.3,
          material: chuteTech ? (chuteTech.materialId === "nylon" ? "nylon" : "plastic") : "plastic",
          trigger: chuteTech?.deployEvent === "apogee" ? ("apogee" as const) : ("delay" as const),
          timerSeconds: chuteTech?.deployDelayS ?? 2,
          shockCordM: cordTech?.cordLengthM ?? 0.6,
          drogueDiaM: 0,
        },
    payload: {
      hasPayload: !!massTech,
      cargoKg: massTech?.massKg ?? 0,
      avionics: "none",
    },
    separation: stage?.separationEvent === "ejection" ? ("hot" as const) : ("cold" as const),
  } satisfies StageConfig;

  return {
    name: r.name,
    stages: [s],
    boosterCount: (r.parallelStages.length > 0 ? r.parallelStages[0].instanceCount : 0) as 0 | 2 | 4,
    boosterMotor: { choice: { kind: "estes", id: "C6-7", count: 2 }, throttle: 1 },
    windMps: r.conditions.windSpeedMps,
    windDeg: r.conditions.windDirectionDeg,
    railM: r.conditions.launchRodLengthM,
    railTiltDeg: r.conditions.launchRodAngleDeg,
    dt: r.conditions.timestepS,
  };
}
