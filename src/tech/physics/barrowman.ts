// Genişletilmiş Barrowman: bileşen bazlı Cn/CP analizi.
// Kanat CP'si: MAC üzerinde çeyrek hat (OpenRocket techdoc eq. 3.33-3.34).
// Kanat CN eğimi: Diederich/Polhamus sonlu açıklık formülü
// CLα = 2π·AR / (2 + √(AR² + 4)); çok kanat için Σ sin²Λ normalizasyonu.
// Gövde (body lift) subsonik yaklaşık 0; burun CN ≈ 2.

import {
  NoseShape,
  TechComponent,
  TechRocket,
} from "../model";

export interface BarrowmanPart {
  id: string;
  kind: string;
  name: string;
  cn: number;
  /** Basınç merkezinin burun ucundan konumu, m */
  cpM: number;
}

export interface BarrowmanResult {
  cp: number;
  cnTotal: number;
  parts: BarrowmanPart[];
}

const NOSE_CP: Record<NoseShape, number> = {
  conical: 2 / 3,
  ogive: 0.525,
  elliptical: 0.5,
  parabolic: 0.545,
  power: 0.6,
  haack: 0.59,
};

const AXIAL_KINDS = new Set([
  "nosecone", "bodytube", "transition", "trapezoidfin", "ellipticalfin", "freeformfin", "tubefin",
]);

const PI = Math.PI;

/** Diederich/Polhamus: ters açıklığı düşük kanat eğimi (rad⁻¹). */
function clAlpha(area: number, span: number): number {
  const AR = (span * span) / Math.max(area, 1e-12);
  return (2 * PI * AR) / (2 + Math.sqrt(AR * AR + 4));
}

/** Çok kanatlı yön normalizasyonu: Σ sin²Λ = N/2. */
function orientationFactor(count: number): number {
  return count / 2;
}

function shoelaceArea(pts: Array<{ x: number; y: number }>): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function maxBodyRadius(rocket: TechRocket): number {
  let r = 0.01;
  const walk = (cs: TechComponent[]): void => {
    for (const c of cs) {
      if (c.kind === "bodytube") {
        r = Math.max(r, c.outerDiameterM / 2);
        walk(c.children);
      }
    }
  };
  for (const st of rocket.stages) walk(st.components);
  return r;
}

/** Yerleşim konumları (assembly.ts ile aynı kurallar). */
function placeXs(rocket: TechRocket): Map<string, number> {
  const m = new Map<string, number>();
  let aft = 0;
  let front: number | null = null;
  const walk = (cs: TechComponent[]): void => {
    for (const c of cs) {
      const radial = c.radialOffsetM > 0;
      const axial = AXIAL_KINDS.has(c.kind);
      const internal = !radial && !axial;
      const x = internal && front !== null ? front + c.axialOffsetM : aft + c.axialOffsetM;
      m.set(c.id, x);
      if (c.kind === "bodytube") {
        aft = x + c.lengthM;
        front = x;
        walk(c.children);
      } else if (axial && !radial) {
        aft = x + geomLength(c);
      }
    }
  };
  for (const st of rocket.stages) walk(st.components);
  return m;
}

function geomLength(c: TechComponent): number {
  switch (c.kind) {
    case "nosecone": return c.lengthM;
    case "bodytube": return c.lengthM;
    case "transition": return c.lengthM;
    case "trapezoidfin": return c.rootChordM;
    case "ellipticalfin": return c.rootChordM;
    case "freeformfin": return Math.max(0, ...c.points.map((p) => p.x));
    case "tubefin": return c.lengthM;
    default: return 0;
  }
}

export function analyzeBarrowman(rocket: TechRocket): BarrowmanResult {
  const xs = placeXs(rocket);
  const bodyRadius = maxBodyRadius(rocket);
  const Sref = PI * bodyRadius * bodyRadius;
  const parts: BarrowmanPart[] = [];

  const emit = (c: TechComponent, cn: number, cpM: number) => {
    if (cn <= 0) return;
    parts.push({ id: c.id, kind: c.kind, name: c.name, cn, cpM });
  };

  const walk = (cs: TechComponent[]): void => {
    for (const c of cs) {
      const x = xs.get(c.id) ?? 0;
      switch (c.kind) {
        case "nosecone":
          emit(c, 2, x + c.lengthM * NOSE_CP[c.shape]);
          break;
        case "transition":
          emit(c, 0.5, x + c.lengthM * 0.3);
          break;
        case "trapezoidfin": {
          const Cr = Math.max(c.rootChordM, 1e-6);
          const area = ((Cr + c.tipChordM) / 2) * c.heightM;
          const cpOff = (c.sweepLengthM / 3) * (Cr + 2 * c.tipChordM) / (Cr + c.tipChordM)
            + (1 / 6) * (Cr * Cr + c.tipChordM * c.tipChordM + Cr * c.tipChordM) / (Cr + c.tipChordM);
          const cn1 = (area / Sref) * clAlpha(area, c.heightM);
          emit(c, cn1 * orientationFactor(c.finCount), x + cpOff);
          break;
        }
        case "ellipticalfin": {
          const area = (PI / 4) * c.rootChordM * c.heightM;
          const cn1 = (area / Sref) * clAlpha(area, c.heightM);
          emit(c, cn1 * orientationFactor(c.finCount), x + c.rootChordM * 0.4);
          break;
        }
        case "freeformfin": {
          const area = shoelaceArea(c.points);
          const span = Math.max(0.001, ...c.points.map((p) => p.y));
          const len = Math.max(...c.points.map((p) => p.x));
          const cn1 = (area / Sref) * clAlpha(area, span);
          emit(c, cn1 * orientationFactor(c.finCount), x + len * 0.4);
          break;
        }
        case "tubefin": {
          const area1 = PI * c.outerDiameterM * c.lengthM;
          const cn1 = (area1 / Sref) * clAlpha(area1, c.lengthM);
          emit(c, cn1 * orientationFactor(c.finCount), x + c.lengthM * 0.5);
          break;
        }
        case "bodytube":
          walk(c.children);
          break;
        default:
          break;
      }
    }
  };
  for (const st of rocket.stages) walk(st.components);

  const cnTotal = parts.reduce((s, p) => s + p.cn, 0);
  const cp = cnTotal > 0 ? parts.reduce((s, p) => s + p.cn * p.cpM, 0) / cnTotal : 0;
  return { cp, cnTotal, parts };
}