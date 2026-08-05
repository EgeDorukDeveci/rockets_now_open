// Barrowman denklemleri — basınç merkezi (CP) hesabı.
// Kaynak: J. S. Barrowman, "The Practical Calculation of the Aerodynamic
// Characteristics of Slender Finned Vehicles" (1967, NASA), NARAM-8 raporu;
// pratik formlar: rocketmime.com/rockets/Barrowman.html, nakka-rocketry.net.
//
// Formüller:
//   Burun:      (CNα)N = 2;  XN = k·LN  (koni 0.666, ogive 0.466, ...)
//   Gövde:      (CNα)B = 2·(A_B/A_ref);  XB = L - V/A_ref  (hacim yöntemi)
//   Geçiş koni: (CNα)T = 2·[(dR/dF)² - 1];  XT = XP + (LT/3)·(1 + 1/(1 + dR/dF))
//   Kanatlar:   (CNα)F = (1 + R/(S+R))² · [4·N·(S/d)² / (1 + sqrt(1 + (2·LF/(CR+CT))²))]
//               XF = XB + (XR/3)·(CR+2CT)/(CR+CT) + (1/6)·(CR + CT - CR·CT/(CR+CT))
//   Toplam:     CP = Σ(CNα_i·X_i) / ΣCNα_i
//   LF (mid-chord) = sqrt( XR'² + S² ), XR' = XR + (CT-CR)/2

export interface BarrowmanNose {
  cn: number; // 2
  x: number; // CP konumu (burun ucundan), m
}

export interface BarrowmanBody {
  cn: number; // 2·(A_B/A_ref)
  x: number; // L - V/A_ref
}

export interface BarrowmanTransition {
  cn: number;
  x: number;
}

export interface BarrowmanFin {
  cn: number;
  x: number;
}

export interface BarrowmanResult {
  /** CP konumu (burun ucundan), m */
  cp: number;
  /** Toplam normal kuvvet türevi, 1/rad */
  cnTotal: number;
  parts: {
    nose: BarrowmanNose;
    body: BarrowmanBody;
    transitions: BarrowmanTransition[];
    fins: BarrowmanFin[];
  };
}

export function barrowmanNose(cpK: number, noseLength: number): BarrowmanNose {
  return { cn: 2, x: cpK * noseLength };
}

export function barrowmanBody(bodyLength: number, volume: number, baseArea: number): BarrowmanBody {
  return { cn: 2, x: bodyLength - volume / Math.max(baseArea, 1e-12) };
}

export function barrowmanTransition(
  xFront: number,
  length: number,
  dFront: number,
  dRear: number,
): BarrowmanTransition {
  const ratio = dRear / Math.max(dFront, 1e-12);
  const cn = 2 * (ratio * ratio - 1);
  const x = xFront + (length / 3) * (1 + 1 / (1 + ratio));
  return { cn, x };
}

export interface FinGeometry {
  /** Kök kiriş, m */
  rootChord: number;
  /** Uç kiriş, m */
  tipChord: number;
  /** Yarı açıklık, m */
  semispan: number;
  /** Süpürme mesafesi (kök LE - uç LE, gövde eksenine paralel), m */
  sweep: number;
  /** Kanat sayısı */
  count: number;
  /** Gövde yarıçapı, m */
  bodyRadius: number;
  /** Burun ucundan kök kiriş ön kenarına mesafe, m */
  xRoot: number;
}

export function barrowmanFins(f: FinGeometry): BarrowmanFin {
  const { rootChord: cr, tipChord: ct, semispan: s, sweep, count: n, bodyRadius: R, xRoot } = f;
  const d = 2 * R;
  // Mid-chord hattı: kök orta noktasından uç orta noktasına
  const xr = sweep + (ct - cr) / 2;
  const lf = Math.sqrt(xr * xr + s * s);
  const interference = (1 + R / Math.max(s + R, 1e-12)) ** 2;
  const cn = interference * ((4 * n * (s / Math.max(d, 1e-12)) ** 2) /
    (1 + Math.sqrt(1 + (2 * lf / Math.max(cr + ct, 1e-12)) ** 2)));
  const x =
    xRoot +
    (sweep / 3) * ((cr + 2 * ct) / Math.max(cr + ct, 1e-12)) +
    (1 / 6) * (cr + ct - (cr * ct) / Math.max(cr + ct, 1e-12));
  return { cn, x };
}

/** Supersonik CP kayması: kanat CP'si orta kirişe doğru geriye kayar. */
export function finCpMachCorrection(fin: BarrowmanFin, finGeom: FinGeometry, mach: number): number {
  const k = Math.max(0, Math.min(1, (mach - 0.6) / 0.9)); // 0.6→1.5 Mach arası
  const shift = (finGeom.rootChord + finGeom.tipChord) / 2 * 0.35 * k;
  return fin.x + shift;
}

export function combineBarrowman(parts: Array<{ cn: number; x: number }>): BarrowmanResult {
  let cnTotal = 0;
  let moment = 0;
  const partArray = parts.filter((p) => Math.abs(p.cn) > 1e-12);
  for (const p of partArray) {
    cnTotal += p.cn;
    moment += p.cn * p.x;
  }
  const cp = cnTotal > 1e-12 ? moment / cnTotal : 0.5;
  return {
    cp,
    cnTotal,
    parts: {
      nose: parts[0] as BarrowmanNose,
      body: parts[1] as BarrowmanBody,
      transitions: [],
      fins: [],
    },
  };
}
