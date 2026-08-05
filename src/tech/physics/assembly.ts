// Teknik mod fizik montajı: bileşen ağacını mutlak konumlu yerleşimlere
// çevirir ve kütle/CG/CP referanslarını hesaplar.
// Yerleşim kuralı: axialOffset, bir önce eklenen bileşenin aft (arka)
// ucuna eklenir; 0 = bitişik. Motormount ve kurtarma donanımı gövde tüpü
// içine yerleştirilir (parent ön ucundan ölçülür).

import { resolveMotor } from "../../physics/rocket";
import { MotorChoice } from "../../types";
import { TECH_MATERIALS, TechMaterial } from "../materials";
import {
  ComponentKind,
  MotorMount,
  TechComponent,
  TechRocket,
} from "../model";
import { analyzeBarrowman } from "./barrowman";

export interface PlacedComponent {
  kind: ComponentKind;
  id: string;
  name: string;
  /** Bileşen ön ucunun burun ucundan eksenel konumu, m */
  x: number;
  /** Eksenel uzunluk (yerleşim katkısı), m */
  lengthM: number;
  radialOffsetM: number;
  angleDeg: number;
  /** Geometrik kütle (motor hariç), kg */
  massKg: number;
  /** Kütle merkezinin burun ucundan konumu, m */
  cgM: number;
}

export interface TechAssembly {
  totalLength: number;
  referenceDiameter: number;
  /** Motorlar hariç tüm yapı kütlesi, kg */
  structureMass: number;
  /** Kalkış kütlesi (motorlar dahil), kg */
  liftoffMass: number;
  /** Toplam itici kütlesi, kg */
  propellantMass: number;
  /** Kütle merkezi, m (burun ucundan) */
  cg: number;
  /** Basınç merkezi, m — Task 4 Barrowman yer tutucusu */
  cp: number;
  /** Toplam normal kuvvet katsayısı — Task 4 yer tutucusu */
  cnTotal: number;
  /** Stabilite marjı, kalibre */
  stability: number;
  placements: PlacedComponent[];
}

export interface CatalogMotor {
  totalImpulse: number;
  burnTime: number;
  mass: number;
  propellant: number;
  length: number;
  diameter: number;
  isp: number;
  ispVacuum: number;
  delay: number;
}

const PI = Math.PI;

export function motorSpecsFromCatalog(id: string): CatalogMotor | null {
  const specs = resolveMotor({ kind: "estes", id, count: 1 } as MotorChoice);
  const s = specs[0];
  if (!s || s.id !== id) return null;
  return {
    totalImpulse: s.totalImpulse,
    burnTime: s.burnTime,
    mass: s.mass,
    propellant: s.propellant,
    length: s.length,
    diameter: s.diameter,
    isp: s.isp,
    ispVacuum: s.ispVacuum,
    delay: s.delay,
  };
}

/** Tüm motormount'larda motoru kaldırır (mutasyon). */
export function clearMotors(r: TechRocket): void {
  const clear = (cs: TechComponent[]): void => {
    for (const c of cs) {
      if (c.kind === "motormount") c.motorId = null;
      if (c.kind === "bodytube") clear(c.children);
    }
  };
  for (const st of r.stages) clear(st.components);
}

const matOf = (c: TechComponent): TechMaterial =>
  TECH_MATERIALS[c.materialId] ?? TECH_MATERIALS.cardboard;

const ringMass = (od: number, id: number, len: number, rho: number): number =>
  PI * ((od / 2) ** 2 - (id / 2) ** 2) * len * rho;

const polygonArea = (pts: Array<{ x: number; y: number }>): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

/** Geometrik kütle, yerel CG (önden) ve yerleşim uzunluğu. */
function geom(c: TechComponent): { mass: number; cgLocal: number; length: number } {
  const mat = matOf(c);
  const base = (mass: number, cgLocal: number, length: number) => {
    const m = c.massOverrideKg !== undefined ? c.massOverrideKg : mass;
    return { mass: m, cgLocal, length };
  };
  switch (c.kind) {
    case "nosecone": {
      const R = c.aftDiameterM / 2;
      const L = c.lengthM;
      const coneSurf = PI * R * Math.sqrt(R * R + L * L);
      const main = coneSurf * c.wallThicknessM * mat.density;
      const shoulder = PI * c.shoulderDiameterM * c.shoulderLengthM * c.wallThicknessM * mat.density;
      const cgLocal = (main * 0.45 * L + shoulder * (L + c.shoulderLengthM / 2)) / Math.max(main + shoulder, 1e-12);
      return base(main + shoulder, cgLocal, L);
    }
    case "bodytube": {
      const mass = ringMass(c.outerDiameterM, Math.max(c.outerDiameterM - 2 * c.wallThicknessM, 0), c.lengthM, mat.density);
      return base(mass, c.lengthM / 2, c.lengthM);
    }
    case "transition": {
      const r1 = c.foreDiameterM / 2;
      const r2 = c.aftDiameterM / 2;
      const slant = Math.sqrt((r2 - r1) ** 2 + c.lengthM ** 2);
      const mass = PI * (r1 + r2) * slant * c.wallThicknessM * mat.density;
      return base(mass, c.lengthM / 2, c.lengthM);
    }
    case "trapezoidfin": {
      const area = ((c.rootChordM + c.tipChordM) / 2) * c.heightM;
      const xbar = c.rootChordM * (c.rootChordM + 2 * c.tipChordM) / (3 * (c.rootChordM + c.tipChordM));
      return base(area * c.thicknessM * mat.density * c.finCount, xbar, c.rootChordM);
    }
    case "ellipticalfin": {
      const area = (PI / 4) * c.rootChordM * c.heightM;
      return base(area * c.thicknessM * mat.density * c.finCount, c.rootChordM * 0.5, c.rootChordM);
    }
    case "freeformfin": {
      const area = polygonArea(c.points);
      const len = Math.max(...c.points.map((p) => p.x));
      return base(area * c.thicknessM * mat.density * c.finCount, len * 0.5, len);
    }
    case "tubefin": {
      const mass = ringMass(c.outerDiameterM, Math.max(c.outerDiameterM - 2 * c.wallThicknessM, 0), c.lengthM, mat.density) * c.finCount;
      return base(mass, c.lengthM / 2, c.lengthM);
    }
    case "parachute": {
      const area = PI * (c.diameterM / 2) ** 2;
      return base(area * mat.density, 0.01, 0.02);
    }
    case "streamer":
      return base(c.stripLengthM * c.stripWidthM * mat.density, 0.01, 0.02);
    case "shockcord":
      return base(c.cordLengthM * mat.density, 0.005, 0.01);
    case "mass":
      return base(c.massKg, 0, 0.01);
    case "launchlug": {
      const wall = c.outerDiameterM * 0.15;
      const mass = ringMass(c.outerDiameterM, Math.max(c.outerDiameterM - 2 * wall, 0), c.lengthM, mat.density);
      return base(mass, c.lengthM / 2, c.lengthM);
    }
    case "railbutton": {
      const vol = PI * (c.outerDiameterM / 2) ** 2 * c.heightM;
      return base(vol * mat.density, c.heightM / 2, c.heightM);
    }
    case "innertube": {
      const mass = ringMass(c.outerDiameterM, Math.max(c.outerDiameterM - 2 * c.wallThicknessM, 0), c.lengthM, mat.density);
      return base(mass, c.lengthM / 2, c.lengthM);
    }
    case "tubecoupler": {
      const mass = ringMass(c.outerDiameterM, Math.max(c.outerDiameterM - 2 * c.wallThicknessM, 0), c.lengthM, mat.density);
      return base(mass, c.lengthM / 2, c.lengthM);
    }
    case "centeringring": {
      const mass = ringMass(c.outerDiameterM, c.innerDiameterM, c.lengthM, mat.density);
      return base(mass, c.lengthM / 2, c.lengthM);
    }
    case "bulkhead": {
      const vol = PI * (c.outerDiameterM / 2) ** 2 * c.lengthM;
      return base(vol * mat.density, c.lengthM / 2, c.lengthM);
    }
    case "engineblock": {
      const vol = PI * (c.outerDiameterM / 2) ** 2 * c.lengthM;
      return base(vol * mat.density, c.lengthM / 2, c.lengthM);
    }
    case "motormount": {
      const m = motorSpecsFromCatalog(c.motorId ?? "");
      const tubeLen = m ? m.length : 0.07;
      const mass = ringMass(0.019, 0.018, tubeLen, mat.density);
      return base(mass, tubeLen / 2, tubeLen);
    }
  }
}

/** Bir bileşen listesini yerleştirir. `inside` bileşenler istiflemeyi ilerletmez. */
function placeList(
  comps: TechComponent[],
  x0: number,
  tubeFront: number | null,
  out: PlacedComponent[]
): { aft: number; tubeFront: number | null } {
  let aft = x0;
  let front = tubeFront;
  for (const c of comps) {
    const g = geom(c);
    const radial = c.radialOffsetM > 0;
    const internal = !radial && !["nosecone", "bodytube", "transition", "trapezoidfin", "ellipticalfin", "freeformfin", "tubefin"].includes(c.kind);
    const x = (internal || radial) && front !== null
      ? front + c.axialOffsetM
      : aft + c.axialOffsetM;
    out.push({
      kind: c.kind,
      id: c.id,
      name: c.name,
      x,
      lengthM: g.length,
      radialOffsetM: c.radialOffsetM,
      angleDeg: c.angleDeg,
      massKg: g.mass,
      cgM: x + g.cgLocal,
    });
    if (c.kind === "bodytube") {
      aft = x + g.length;
      front = x;
    } else if (!radial && !internal) {
      aft = x + g.length;
    }
  }
  return { aft, tubeFront: front };
}

export function placeRocket(r: TechRocket): PlacedComponent[] {
  const out: PlacedComponent[] = [];
  let aft = 0;
  let front: number | null = null;
  for (const st of r.stages) {
    const res = placeList(st.components, aft, front, out);
    aft = res.aft;
    front = res.tubeFront;
  }
  return out;
}

/** Motor kütlesini motormount'a ekler: CG = mountFront + overhang + motor.length/2. */
function motorMassAt(c: MotorMount, mountFront: number): { mass: number; cgM: number } {
  if (!c.motorId) return { mass: 0, cgM: 0 };
  const m = motorSpecsFromCatalog(c.motorId);
  if (!m) return { mass: 0, cgM: 0 };
  return { mass: m.mass, cgM: mountFront + c.overhangM + m.length / 2 };
}

export function assembleTech(r: TechRocket): TechAssembly {
  const placements = placeRocket(r);

  let referenceDiameter = 0.01;
  const collectTubes = (cs: TechComponent[]): void => {
    for (const c of cs) {
      if (c.kind === "bodytube") {
        referenceDiameter = Math.max(referenceDiameter, c.outerDiameterM);
        collectTubes(c.children);
      }
    }
  };
  for (const st of r.stages) collectTubes(st.components);

  let totalLength = 0;
  for (const p of placements) totalLength = Math.max(totalLength, p.x + p.lengthM);

  let structureMass = 0;
  let sumMom = 0;
  let motorMass = 0;
  let propellantMass = 0;
  for (const p of placements) {
    structureMass += p.massKg;
    sumMom += p.massKg * p.cgM;
  }
  // Motor kütlelerini bul
  const stages = r.stages;
  const findMounts = (cs: TechComponent[]): MotorMount[] => {
    const res: MotorMount[] = [];
    for (const c of cs) {
      if (c.kind === "motormount") res.push(c);
      if (c.kind === "bodytube") res.push(...findMounts(c.children));
    }
    return res;
  };
  const mountFronts = new Map<string, number>();
  for (const p of placements) if (p.kind === "motormount") mountFronts.set(p.id, p.x);
  for (const st of stages) {
    for (const m of findMounts(st.components)) {
      if (!m.motorId) continue;
      const spec = motorSpecsFromCatalog(m.motorId);
      if (!spec) continue;
      const { mass, cgM } = motorMassAt(m, mountFronts.get(m.id) ?? 0);
      motorMass += mass;
      sumMom += mass * cgM;
      propellantMass += spec.propellant;
    }
  }

  const liftoffMass = structureMass + motorMass;
  const cg = liftoffMass > 0 ? sumMom / liftoffMass : 0;
  const barrowman = analyzeBarrowman(r);
  const cp = barrowman.cp;
  const cnTotal = barrowman.cnTotal;
  const stability = (cp - cg) / referenceDiameter;

  return {
    totalLength,
    referenceDiameter,
    structureMass,
    liftoffMass,
    propellantMass,
    cg,
    cp,
    cnTotal,
    stability,
    placements,
  };
}