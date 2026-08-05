// Bileşen bazlı sürükleme analizi: sürtünme (skin friction) + taban + basınç.
// Cd(Mach): transonik tepe ~M 1.0-1.2 (≥1.5× subsonik), süpersonik 1/M düşüşü.
// Standart atmosfer: ρ=1.225 kg/m³, μ=1.81e-5 Pa·s, a=340.3 m/s.

import {
  TechComponent,
  TechRocket,
} from "../model";

export interface DragPart {
  id: string;
  kind: string;
  name: string;
  cd: number;
  note: string;
}

export interface DragResult {
  mach: number;
  cdTotal: number;
  parts: DragPart[];
}

const PI = Math.PI;
const RHO = 1.225;
const MU = 1.81e-5;
const A = 340.3;

const FINISH_FACTOR: Record<string, number> = {
  normal: 1.0,
  smooth: 0.92,
  rough: 1.28,
  polished: 0.85,
};

/** Franken görünümü: subsonik sabit, teşi ~2.2×, süpersonik 1/M^0.7 düşüş. */
function machFactor(mach: number): number {
  const m = Math.max(mach, 0);
  if (m < 0.7) return 1;
  if (m <= 1) return 1 + ((m - 0.7) / 0.3) * 1.2;
  return 2.2 * Math.pow(m, -0.7);
}

function finPlanform(c: TechComponent): number {
  switch (c.kind) {
    case "trapezoidfin":
      return ((c.rootChordM + c.tipChordM) / 2) * c.heightM * c.finCount;
    case "ellipticalfin":
      return (PI / 4) * c.rootChordM * c.heightM * c.finCount;
    case "freeformfin": {
      let a = 0;
      for (let i = 0; i < c.points.length; i++) {
        const p = c.points[i];
        const q = c.points[(i + 1) % c.points.length];
        a += p.x * q.y - q.x * p.y;
      }
      return (Math.abs(a) / 2) * c.finCount;
    }
    case "tubefin":
      return PI * c.outerDiameterM * c.lengthM * c.finCount;
    default:
      return 0;
  }
}

/** Islak alan, m² (kanatlar iki yüz). */
function wetArea(c: TechComponent): number {
  switch (c.kind) {
    case "nosecone": {
      const R = c.aftDiameterM / 2;
      return PI * R * Math.sqrt(R * R + c.lengthM * c.lengthM);
    }
    case "bodytube":
      return PI * c.outerDiameterM * c.lengthM;
    case "transition": {
      const r1 = c.foreDiameterM / 2;
      const r2 = c.aftDiameterM / 2;
      return PI * (r1 + r2) * Math.sqrt((r2 - r1) ** 2 + c.lengthM ** 2);
    }
    case "trapezoidfin":
    case "ellipticalfin":
    case "freeformfin":
    case "tubefin":
      return 2 * finPlanform(c);
    case "launchlug":
      return PI * c.outerDiameterM * c.lengthM;
    default:
      return 0;
  }
}

/** Komponentleri toplar (bodytube children dahil). */
function collect(r: TechRocket): TechComponent[] {
  const out: TechComponent[] = [];
  const walk = (cs: TechComponent[]): void => {
    for (const c of cs) {
      out.push(c);
      if (c.kind === "bodytube") walk(c.children);
    }
  };
  for (const st of r.stages) walk(st.components);
  return out;
}

function maxDiameter(r: TechRocket): number {
  let d = 0.01;
  for (const c of collect(r)) if (c.kind === "bodytube") d = Math.max(d, c.outerDiameterM);
  return d;
}

function referenceArea(r: TechRocket): number {
  return PI * (maxDiameter(r) / 2) ** 2;
}

export function cdAtMach(r: TechRocket, mach: number): DragResult {
  const Sref = referenceArea(r);
  const comps = collect(r);
  const v = Math.max(mach, 0) * A;
  const lengthRef = Math.max(0.1, ...comps.map(axialLength));
  const Re = (RHO * v * lengthRef) / MU;
  const Cf = Re > 0 ? 0.074 / Math.pow(Re, 0.2) : 0.004;
  const mf = machFactor(Math.max(mach, 0));

  const parts: DragPart[] = [];
  let cdFriction = 0;
  for (const c of comps) {
    const area = wetArea(c);
    if (area <= 0) continue;
    const finishFactor = ["bodytube", "nosecone", "transition"].includes(c.kind)
      ? FINISH_FACTOR[c.finish] ?? 1
      : 1;
    const cd = (Cf * area * finishFactor * mf) / Sref;
    cdFriction += cd;
    parts.push({ id: c.id, kind: c.kind, name: c.name, cd, note: "Sürtünme" });
  }

  let cdFinPressure = 0;
  for (const c of comps) {
    if (!["trapezoidfin", "ellipticalfin", "freeformfin"].includes(c.kind)) continue;
    const f = c as { thicknessM?: number; rootChordM?: number };
    const t = f.thicknessM ?? 0.003;
    const root = f.rootChordM ?? 0.07;
    const area = finPlanform(c);
    cdFinPressure += (0.05 * (t / Math.max(root, 0.01)) * area * mf) / Sref;
  }

  const baseCd = (0.12 / (1 + mach * mach)) * mf;
  const cdTotal = cdFriction + cdFinPressure + baseCd;

  parts.push({ id: "finpressure", kind: "fin", name: "Kanat basıncı", cd: cdFinPressure, note: "Profil kalınlık" });
  parts.push({ id: "base", kind: "base", name: "Taban", cd: baseCd, note: "Taban sürtünmesi" });
  return { mach, cdTotal, parts };
}

function axialLength(c: TechComponent): number {
  switch (c.kind) {
    case "nosecone": return c.lengthM;
    case "bodytube": return c.lengthM;
    case "transition": return c.lengthM;
    case "trapezoidfin": return c.rootChordM;
    case "ellipticalfin": return c.rootChordM;
    case "freeformfin": return Math.max(...c.points.map((p) => p.x));
    case "tubefin": return c.lengthM;
    case "launchlug": return c.lengthM;
    default: return 0;
  }
}

export function cdMachTable(r: TechRocket, maxMach = 3, step = 0.1): DragResult[] {
  const out: DragResult[] = [];
  for (let i = 0; i <= Math.round(maxMach / step); i++) {
    out.push(cdAtMach(r, i * step));
  }
  return out;
}